// xdr/known-cve/patterns.json 의 패턴을 그대로 옮겨 둡니다. 두 곳을 함께 고칩니다.
// 심판은 인터넷 없이 이 파일 하나만 불러오므로 import·파일 읽기·외부 호출을 쓰지 않습니다.
// 경보 안의 원격 조회 구문은 문서용 표기입니다. 이 파일은 그 문자열을 찾기만 하고 실행·전송·변형하지 않습니다.
const PATTERNS = Object.freeze({
  header: {
    name: '요청 머리글 안의 원격 조회 구문',
    condition: 'data.useragent 같은 요청 머리글 값에 ${jndi: 로 시작하고 프로토콜(ldap·ldaps·rmi·dns 등)과 :// 원격 주소가 이어지는 완전한 조회 구문이 들어 있다.',
    evidence: 'NVD CVE-2021-44228: Log4j2는 기록되는 메시지 안의 JNDI 조회를 막지 않아, 기록될 값(머리글 등)을 조작할 수 있는 공격자가 LDAP 서버에서 불러온 코드를 실행할 수 있다.',
  },
  argument: {
    name: '요청 인자 안의 원격 조회 구문',
    condition: 'data.url 의 검색어·이동 주소 같은 인자 값에 ${jndi: 로 시작하고 프로토콜과 :// 원격 주소가 이어지는 완전한 조회 구문이 들어 있다.',
    evidence: 'NVD CVE-2021-44228: 기록 메시지의 매개변수(요청 인자 등)를 조작할 수 있는 공격자는 메시지 조회 치환이 켜진 Log4j2에서 원격 코드를 실행할 수 있다.',
  },
  scanner: {
    name: '알려진 취약점 점검 흔적과 원격 조회 구문의 결합',
    condition: '같은 data.srcip 의 요청에 취약점 점검 표식(probe 인자, 점검 도구 이름 등)이 있고, 같은 요청 안에 위 두 패턴의 완전한 조회 구문이 함께 있다. 점검 표식만 있고 조회 구문이 없으면 이 패턴에 해당하지 않는다.',
    evidence: 'MITRE ATT&CK T1190: 공격자는 인터넷에 공개된 애플리케이션의 이미 알려진 약점을 찾아 악용하며, 점검 흔적에 악용 구문이 실린 요청은 탐색을 넘어선 악용 시도다.',
  },
});

const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;

// 완전한 원격 조회 구문: ${jndi:<프로토콜>://<주소>
const FULL_LOOKUP = /\$\{\s*jndi\s*:\s*(?:ldaps?|rmi|dns|iiop|nis|nds|corba|https?)\s*:\/\/[^\s}]+/iu;
// 구문은 아니지만 이 취약점과 관련된 낱말·조각(애매한 시도)
const RELATED_WORD = /cve-?2021-?44228|\bcve\b|jndi|log4j|log-?library|lookup|class-?check|\$\{/iu;
// 취약점 점검 표식
const SCANNER_MARK = /[?&]probe=|scanner|class-?check/iu;

// 설명 문장은 보조 신호입니다. 요청 값이 우선입니다.
const TEXT_FULL_CLAIM = /원격\s*조회\s*구문이\s*있|CVE-2021-44228\s*(?:형태|표기)(?!.*없)/u;
const TEXT_NEGATION = /(?:구문|형태)[은는이가]?\s*(?:없|아닙)|완전한\s*구문은\s*아닙/u;
const TEXT_RELATED = /CVE-2021-44228|jndi|중괄호|점검\s*도구|취약점|라이브러리|조회\s*형태|잘린/iu;
const TEXT_SCANNER = /점검\s*(?:흔적|도구)/u;
const NON_HEADER_FIELDS = new Set(['srcip', 'srcuser', 'url', 'count']);

function decoded(value) {
  let text = String(value);
  for (let round = 0; round < 2; round += 1) {
    try {
      const next = decodeURIComponent(text);
      if (next === text) break;
      text = next;
    } catch {
      break;
    }
  }
  return text;
}

function requestValues(data) {
  const headers = [];
  const args = [];
  if (!data || typeof data !== 'object') return { headers, args };
  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== 'string' || (NON_HEADER_FIELDS.has(key) && key !== 'url')) continue;
    (key === 'url' ? args : headers).push(decoded(value));
  }
  return { headers, args };
}

function repeatCount(data) {
  const count = Number.parseInt(data?.count, 10);
  return Number.isFinite(count) && count > 0 ? count : 1;
}

const clamp = value => Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;

function answer(confidence, reason) {
  const value = clamp(confidence);
  const action = value >= BLOCK_AT ? 'block' : value >= ALERT_AT ? 'alert' : 'record';
  return { action, confidence: value, reason };
}

export function decide(alert) {
  const data = alert?.data;
  const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
  const level = Number.isFinite(alert?.rule?.level) ? alert.rule.level : 0;
  const t1190 = Array.isArray(alert?.rule?.mitre) && alert.rule.mitre.includes('T1190');
  const { headers, args } = requestValues(data);
  const count = repeatCount(data);

  const inHeader = headers.some(value => FULL_LOOKUP.test(value));
  const inArgument = args.some(value => FULL_LOOKUP.test(value));
  const scannerMark = [...headers, ...args].some(value => SCANNER_MARK.test(value)) || TEXT_SCANNER.test(description);

  // 1) 요청 값에 완전한 원격 조회 구문이 있으면 뚜렷한 악용 시도입니다.
  if (inHeader || inArgument) {
    let confidence = 0.9;
    if (inHeader && inArgument) confidence += 0.04;
    if (count >= 2) confidence += 0.03;
    if (t1190) confidence += 0.02;
    const pattern = scannerMark ? PATTERNS.scanner : inHeader ? PATTERNS.header : PATTERNS.argument;
    const where = inHeader && inArgument ? ' (머리글·인자 모두)' : '';
    return answer(confidence, `${pattern.name}${where}${count >= 2 ? ` · ${count}회` : ''}`);
  }

  // 2) 구문은 없지만 관련 낱말·조각이 있거나 설명이 구문을 말하면 애매한 시도로 알립니다.
  const negated = TEXT_NEGATION.test(description);
  const textClaim = !negated && TEXT_FULL_CLAIM.test(description);
  const relatedValue = [...headers, ...args].some(value => RELATED_WORD.test(value));
  const relatedText = TEXT_RELATED.test(description);
  if (textClaim || relatedValue || (t1190 && relatedText)) {
    let confidence = textClaim ? 0.8 : 0.6;
    if (count >= 2) confidence += 0.05;
    if (t1190) confidence += 0.03;
    const pattern = args.some(value => RELATED_WORD.test(value)) ? PATTERNS.argument : PATTERNS.header;
    return answer(Math.min(confidence, 0.84), `${pattern.name} — 관련 흔적만 있고 완전한 조회 구문은 없음`);
  }

  // 3) 그 밖은 정상 이벤트로 기록만 합니다.
  return answer(level >= 8 ? 0.2 : 0.05, '해당 패턴 없음');
}
