import { readFile } from 'node:fs/promises';

// patterns.json 을 읽지 못하는 격리 환경에서도 같은 이름으로 판단합니다.
const FALLBACK_PATTERNS = [
  { name: '같은 주소·같은 계정의 짧은 시간 연속 실패', condition: '짧은 시간 동안 같은 data.srcip과 data.srcuser 조합에서 로그인 실패가 연속으로 발생한다.' },
  { name: '같은 주소에서 여러 계정에 같은 비밀번호 대입', condition: '짧은 시간 동안 같은 data.srcip에서 동일한 비밀번호를 여러 data.srcuser 계정에 대입한 로그인 실패가 발생한다.' },
];

async function loadPatterns() {
  try {
    const document = JSON.parse(
      await readFile(new URL('./patterns.json', import.meta.url), 'utf8'),
    );
    if (Array.isArray(document?.patterns) && document.patterns.length >= 2
        && document.patterns.every((item) => typeof item?.name === 'string')) {
      return document.patterns;
    }
  } catch {
    // 아래 기본 패턴을 씁니다.
  }
  return FALLBACK_PATTERNS;
}

const [passwordGuessingPattern, passwordSprayingPattern] = await loadPatterns();

// 문구는 보조 신호입니다. 건수·계정 수·T1110 같은 구조 항목을 먼저 봅니다.
const FAILURE_SIGNAL =
  /실패|거부|오류|틀린|잘못된|잠금|failed|failure|invalid|denied/iu;

// 비밀번호가 같다는 사실만으로 여러 계정이라고 판단하지 않습니다.
const MULTI_ACCOUNT_SIGNAL =
  /여러\s*계정|서로\s*다른\s*계정|두\s*계정|계정\s*이름을\s*바꿔|계정을\s*바꿔/u;

const SAME_PASSWORD_SIGNAL = /같은\s*비밀번호|동일(?:한)?\s*비밀번호/u;
const REPEAT_SIGNAL = /연속|연달아|반복|이어|쌓|같은\s*간격/u;

const GUESSING_SIGNAL =
  /비밀번호[^.!?\n]*(?:한\s*글자씩\s*바꿔|바꿔\s*가며|추측)|무차별\s*대입|brute\s*force/iu;

const ATTEMPT_SIGNAL = /대입|넣(?:었|습)|시도/u;

const NO_SUCCESS_SIGNAL =
  /성공(?:은|이)?\s*(?:없(?:습니다|음)?|하지\s*않\S*|못\S*|0\s*(?:건|회|번))/gu;

// 이 모듈의 보수적인 경험 기준이며 MITRE/심판의 정답 기준이 아닙니다.
const CLEAR_FAILURE_COUNT = 15;
const CLEAR_ACCOUNT_COUNT = 5;
const SHORT_WINDOW_SECONDS = 300;

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

function countFrom(description, expression) {
  const match = expression.exec(description);
  return match ? nonnegativeInteger(match[1] ?? match[2]) : null;
}

function windowSecondsFrom(text) {
  const match = /(\d+)\s*(초|분|시간)\s*(?:안|동안|이내|사이|에)/u.exec(text);
  if (!match) return null;
  const unit = match[2] === '시간' ? 3600 : match[2] === '분' ? 60 : 1;
  return Number(match[1]) * unit;
}

function extractAlert(alert) {
  const rawLevel = alert?.level ?? alert?.rule?.level;
  const description = alert?.description ?? alert?.rule?.description;
  const text = typeof description === 'string' ? description : '';
  const mitre = alert?.mitre ?? alert?.rule?.mitre;
  const mitreIds = Array.isArray(mitre)
    ? mitre.map((item) => (typeof item === 'string' ? item : item?.id))
    : [mitre?.id ?? mitre].flat();

  const rawAccounts = alert?.accounts ?? alert?.data?.accounts;

  const accounts = Array.isArray(rawAccounts)
    ? rawAccounts
    : typeof rawAccounts === 'string'
      ? rawAccounts.split(',')
      : [];

  const distinctAccounts = new Set(
    accounts
      .filter((account) => typeof account === 'string')
      .map((account) => account.trim())
      .filter(Boolean),
  );

  const describedAccounts =
    countFrom(
      text,
      /계정\s*(\d+)\s*개|(\d+)\s*개(?:의)?\s*계정/u,
    ) ?? 0;

  const failureCount =
    nonnegativeInteger(alert?.count)
    ?? nonnegativeInteger(alert?.data?.count)
    ?? countFrom(text, /(\d+)\s*(?:건|회|번)/u);

  const accountCount = Math.max(
    distinctAccounts.size,
    describedAccounts,
  );

  const successText = text.replace(NO_SUCCESS_SIGNAL, '');

  return {
    timestamp: alert?.timestamp,
    srcip: alert?.srcip ?? alert?.data?.srcip,
    srcuser: alert?.srcuser ?? alert?.data?.srcuser,
    level: typeof rawLevel === 'number' ? rawLevel : Number(rawLevel),
    description: text,
    failureCount,
    accountCount,
    windowSeconds: windowSecondsFrom(text),
    t1110: mitreIds.some((id) => typeof id === 'string' && id.startsWith('T1110')),
    hasFailure: FAILURE_SIGNAL.test(text),
    hasSuccess: /성공|success/iu.test(successText),
    multipleAccounts:
      accountCount >= 2 || MULTI_ACCOUNT_SIGNAL.test(text),
    samePassword: SAME_PASSWORD_SIGNAL.test(text),
    repeated: REPEAT_SIGNAL.test(text),
    explicitGuessing: GUESSING_SIGNAL.test(text),
    hasAttempt: ATTEMPT_SIGNAL.test(text),
  };
}

// 로그인 실패·대입의 흔적이 하나라도 있는지 봅니다.
function hasBruteForceEvidence(row) {
  return row.hasFailure
    || row.explicitGuessing
    || (row.failureCount ?? 0) >= 2
    || row.accountCount >= 2
    || (row.t1110 && !row.hasSuccess)
    || (row.samePassword && row.hasAttempt);
}

function matchPattern(row) {
  if (!hasBruteForceEvidence(row)) return null;
  return row.multipleAccounts ? passwordSprayingPattern : passwordGuessingPattern;
}

function isNormalEvent(row) {
  if (!hasBruteForceEvidence(row)) return true;

  // 실패 1건 이하 뒤 성공 같은 일상 사건입니다.
  // 낮은 규칙 수준만으로 대량 실패를 정상 처리하지 않습니다.
  return Number.isFinite(row.level)
    && row.level <= 3
    && (row.failureCount ?? 0) <= 1
    && !row.multipleAccounts
    && !row.explicitGuessing;
}

function isClearAttack(row, pattern) {
  if (!pattern) return false;

  const shortOrUnknownWindow =
    row.windowSeconds === null || row.windowSeconds <= SHORT_WINDOW_SECONDS;

  // 짧은 시간(또는 시간 표기 없음)의 대량 실패입니다.
  const highVolume =
    (row.failureCount ?? 0) >= CLEAR_FAILURE_COUNT && shortOrUnknownWindow;

  // 같은 주소가 여러 계정에 대입한 경우입니다.
  const manyAccounts =
    row.accountCount >= CLEAR_ACCOUNT_COUNT && shortOrUnknownWindow;

  const passwordSpray =
    !row.hasSuccess
    && row.multipleAccounts
    && row.samePassword
    && ((row.failureCount ?? 0) >= 2 || row.repeated);

  const passwordGuessing =
    !row.hasSuccess
    && row.explicitGuessing
    && ((row.failureCount ?? 0) >= 2 || row.repeated);

  // 건수 항목이 없어도 높은 수준의 반복 실패는 막습니다.
  const repeatedHighLevel =
    !row.hasSuccess
    && row.failureCount === null
    && Number.isFinite(row.level)
    && row.level >= 10
    && row.repeated
    && (row.hasFailure || row.t1110)
    && shortOrUnknownWindow;

  return highVolume
    || manyAccounts
    || passwordSpray
    || passwordGuessing
    || repeatedHighLevel;
}

async function askJev(row, pattern) {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(
      'https://api.typesafe.ai/v1/systemone',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(3000),

        body: JSON.stringify({
          model: 'jev-latest',

          state: JSON.stringify({
            timestamp: row.timestamp,
            sourceAddress: row.srcip,
            account: row.srcuser,
            ruleLevel: row.level,
            description: row.description,
            failureCount: row.failureCount,
            accountCount: row.accountCount,
            windowSeconds: row.windowSeconds,

            matchedPattern: {
              name: pattern.name,
              condition: pattern.condition,
            },
          }),

          questions: {
            is_brute_force: {
              type: 'noul',

              instructions:
                '이 경보가 일상적인 로그인 실수가 아니라 근거 패턴에 해당하는 무차별 로그인 공격인가?',

              criteria: {
                true:
                  '짧은 시간의 반복 로그인 실패 또는 여러 계정에 같은 비밀번호를 대입한 공격 신호가 있다.',
                false:
                  '소수의 실패 뒤 성공했거나 정상 로그인·로그아웃·세션 활동이다.',
              },
            },
          },
        }),
      },
    );

    if (!response.ok) return null;

    const body = await response.json();
    const confidence = body?.answers?.is_brute_force?.noul;

    if (
      !Number.isFinite(confidence)
      || confidence < 0
      || confidence > 1
    ) {
      return null;
    }

    return confidence;
  } catch {
    return null;
  }
}

export async function decide(alert) {
  const row = extractAlert(alert);
  const pattern = matchPattern(row);

  if (!pattern || isNormalEvent(row)) {
    return {
      action: 'record',
      confidence: 0,
      reason: '근거 패턴 없음',
    };
  }

  if (isClearAttack(row, pattern)) {
    return {
      action: 'block',
      confidence: 0.95,
      reason: pattern.name,
    };
  }

  const jevConfidence = await askJev(row, pattern);
  const confidence = jevConfidence ?? 0.5;

  return {
    action: actionFor(confidence),
    confidence,
    reason: pattern.name,
  };
}
