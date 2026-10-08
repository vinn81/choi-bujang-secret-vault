// xdr/web-injection/patterns.json 의 패턴을 그대로 옮겨 둡니다. 두 곳을 함께 고칩니다.
// 심판은 인터넷 없이 이 파일 하나만 불러오므로 import·파일 읽기·외부 호출을 쓰지 않습니다.
const PATTERNS = Object.freeze({
  sql: {
    name: '요청 인자 안의 SQL 구문',
    condition: '같은 data.srcip 의 요청에서 data.url 의 검색어·입력 인자에 따옴표로 문장을 끊고 SQL 구문(UNION SELECT, OR 1=1, 주석 표기 등)을 이어 붙인 형태가 반복해서 나타난다.',
  },
  script: {
    name: '요청 인자 안의 스크립트 태그',
    condition: '같은 data.srcip 의 요청에서 data.url 의 입력 인자에 <script> 태그나 이벤트 처리 속성(onerror= 등) 같은 스크립트 삽입 표식이 반복해서 나타난다.',
  },
  traversal: {
    name: '경로 거슬러 올라가기(../) 반복',
    condition: '같은 data.srcip 의 요청에서 data.url 의 경로·파일 인자에 ../ 또는 그 인코딩(%2e%2e%2f 등)이 여러 단계 이어지는 형태가 반복해서 나타난다.',
  },
  command: {
    name: '요청 인자 안의 명령 구분자',
    condition: '같은 data.srcip 의 요청에서 data.url 의 입력 인자에 ; | && ` $( 같은 명령 구분자 뒤로 운영체제 명령을 이어 붙인 형태가 반복해서 나타난다.',
  },
});

// 주소창 인자에서 찾는 표식입니다. doc-* 는 수업 경보의 문서용 표기입니다.
const URL_SIGNALS = {
  sql: /(?:'|%27)\s*(?:or|and)\s+\S+\s*=|union(?:\s|\+|%20|\/\*\*\/)+(?:all(?:\s|\+|%20)+)?select|;\s*(?:select|drop|insert|update|delete)\b|\bsleep\s*\(|\bbenchmark\s*\(|doc-sql/iu,
  script: /<\s*\/?\s*script|%3c\s*script|\bon(?:error|load|mouseover|focus)\s*=|javascript:|doc-script/iu,
  traversal: /(?:\.\.|%2e%2e|%252e%252e)(?:\/|\\|%2f|%5c|%252f)|doc-up/iu,
  command: /(?:;|\|\|?|&&|`|\$\()\s*(?:cat|ls|id|whoami|uname|wget|curl|sh|bash|nc|ping|powershell|cmd)\b|doc-cmd/iu,
};

// 설명 문장은 보조 신호입니다.
const TEXT_SIGNALS = {
  sql: /sql|데이터베이스|쿼리|따옴표/iu,
  script: /스크립트|script/iu,
  traversal: /경로|거슬러|상위\s*폴더|\.\.\//u,
  command: /명령\s*(?:구분자|어|문)|셸|쉘/u,
};

const MIXED_SIGNAL = /doc-mixed/iu;
const NO_REPEAT_SIGNAL = /반복(?:은|이)?\s*(?:없|되지\s*않|하지\s*않)\S*/gu;
const REPEAT_SIGNAL = /반복|연속|번갈아|이어/u;

// 이 모듈의 보수적인 경험 기준이며 MITRE/심판의 정답 기준이 아닙니다.
const CLEAR_REPEAT_COUNT = 5;

function actionFor(confidence) {
  if (confidence >= 0.85) return 'block';
  if (confidence >= 0.5) return 'alert';
  return 'record';
}

function nonnegativeInteger(value) {
  if (typeof value === 'string') {
    if (!/^\d+$/u.test(value.trim())) return null;
    value = Number(value.trim());
  }
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function safeDecode(value) {
  let text = value;
  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(text.replace(/\+/gu, ' '));
      if (decoded === text) break;
      text = decoded;
    } catch {
      break;
    }
  }
  return text;
}

function extractAlert(alert) {
  const rawLevel = alert?.level ?? alert?.rule?.level;
  const rawDescription = alert?.description ?? alert?.rule?.description;
  const description = typeof rawDescription === 'string' ? rawDescription : '';
  const rawUrl = alert?.url ?? alert?.data?.url;
  const url = typeof rawUrl === 'string' ? rawUrl : '';
  const mitre = alert?.mitre ?? alert?.rule?.mitre;
  const mitreIds = (Array.isArray(mitre) ? mitre : [mitre])
    .map((item) => (typeof item === 'string' ? item : item?.id))
    .filter((id) => typeof id === 'string');

  const textCount = /(\d+)\s*(?:번|회|건)/u.exec(description);
  const repeatCount =
    nonnegativeInteger(alert?.count)
    ?? nonnegativeInteger(alert?.data?.count)
    ?? (textCount ? nonnegativeInteger(textCount[1]) : null);

  const urlText = `${url}\n${safeDecode(url)}`;
  const forms = Object.keys(PATTERNS).filter((key) => URL_SIGNALS[key].test(urlText)
    || TEXT_SIGNALS[key].test(description)
    || (MIXED_SIGNAL.test(url) && (key === 'sql' || key === 'script')));

  return {
    level: typeof rawLevel === 'number' ? rawLevel : Number(rawLevel),
    t1190: mitreIds.some((id) => id.startsWith('T1190')),
    forms,
    urlForms: Object.keys(PATTERNS).filter((key) => URL_SIGNALS[key].test(urlText)),
    repeatCount,
    repeated: REPEAT_SIGNAL.test(description.replace(NO_REPEAT_SIGNAL, '')),
  };
}

function scoreAlert(row) {
  // T1190 태그도, 주소창의 주입 표식도 없으면 정상 이벤트입니다.
  if (!row.t1190 && row.urlForms.length === 0) return 0;

  const count = row.repeatCount;
  // 같은 주소에서 반복된 주입 시도만 명확한 공격으로 봅니다.
  if (count !== null && count >= CLEAR_REPEAT_COUNT) return 0.95;
  if (count === null && row.repeated && Number.isFinite(row.level) && row.level >= 10) return 0.9;

  // 한두 번 보인 표식은 알림까지만 남깁니다(최대 0.8).
  let confidence = 0.6;
  if (row.forms.length > 0) confidence += 0.1;
  if ((count ?? 0) >= 2 || (Number.isFinite(row.level) && row.level >= 8)) confidence += 0.1;
  return Math.min(confidence, 0.8);
}

function reasonFor(row, confidence) {
  if (confidence < 0.5) return '근거 패턴 없음';
  if (row.forms.length === 0) return 'T1190 경보이나 주입 형태 미확인';
  return row.forms.map((key) => PATTERNS[key].name).join(' + ');
}

export function decide(alert) {
  const row = extractAlert(alert);
  const confidence = scoreAlert(row);
  return {
    action: actionFor(confidence),
    confidence,
    reason: reasonFor(row, confidence),
  };
}
