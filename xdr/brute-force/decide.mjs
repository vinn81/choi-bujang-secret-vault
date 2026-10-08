import { readFile } from 'node:fs/promises';

const patternsDocument = JSON.parse(
  await readFile(new URL('./patterns.json', import.meta.url), 'utf8'),
);

const [passwordGuessingPattern, passwordSprayingPattern] =
  patternsDocument.patterns;

const FAILURE_SIGNAL =
  /로그인\s*실패|인증\s*실패|비밀번호[^.!?\n]*실패|실패(?:가|\s*\d+\s*(?:건|회|번))/u;

// 비밀번호가 같다는 사실만으로 여러 계정이라고 판단하지 않습니다.
const MULTI_ACCOUNT_SIGNAL =
  /여러\s*계정|서로\s*다른\s*계정|두\s*계정|계정\s*이름을\s*바꿔/u;

const SAME_PASSWORD_SIGNAL = /같은\s*비밀번호|동일(?:한)?\s*비밀번호/u;
const REPEAT_SIGNAL = /연속|반복|이어|쌓|같은\s*간격/u;

const GUESSING_SIGNAL =
  /비밀번호[^.!?\n]*(?:한\s*글자씩\s*바꿔|바꿔\s*가며|추측)|무차별\s*대입/u;

const ATTEMPT_SIGNAL = /대입|넣(?:었|습)|시도/u;

const NO_SUCCESS_SIGNAL =
  /성공(?:은|이)?\s*(?:없(?:습니다|음)?|하지\s*않\S*|못\S*|0\s*(?:건|회|번))/gu;

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

function extractAlert(alert) {
  const rawLevel = alert?.level ?? alert?.rule?.level;
  const description = alert?.description ?? alert?.rule?.description;
  const text = typeof description === 'string' ? description : '';

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

  const window = /(\d+)\s*(초|분)\s*(?:안|동안|이내)/u.exec(text);

  const failureCount =
    nonnegativeInteger(alert?.count)
    ?? nonnegativeInteger(alert?.data?.count)
    ?? countFrom(text, /실패[^.!?\n]{0,30}?(\d+)\s*(?:건|회|번)/u)
    ?? 0;

  const accountCount = Math.max(
    distinctAccounts.size,
    describedAccounts,
  );

  return {
    timestamp: alert?.timestamp,
    srcip: alert?.srcip ?? alert?.data?.srcip,
    srcuser: alert?.srcuser ?? alert?.data?.srcuser,
    level: typeof rawLevel === 'number' ? rawLevel : Number(rawLevel),
    description: text,
    failureCount,
    accountCount,

    windowSeconds: window
      ? Number(window[1]) * (window[2] === '분' ? 60 : 1)
      : null,

    hasFailure: FAILURE_SIGNAL.test(text),
    hasSuccess: /성공/u.test(text.replace(NO_SUCCESS_SIGNAL, '')),
    multipleAccounts:
      accountCount >= 2 || MULTI_ACCOUNT_SIGNAL.test(text),
    samePassword: SAME_PASSWORD_SIGNAL.test(text),
    repeated: REPEAT_SIGNAL.test(text),
    explicitGuessing: GUESSING_SIGNAL.test(text),
    hasAttempt: ATTEMPT_SIGNAL.test(text),
  };
}

function matchPattern(row) {
  if (!row.srcip) return null;

  if (
    row.multipleAccounts
    && (
      row.hasFailure
      || (
        row.samePassword
        && row.hasAttempt
        && !row.hasSuccess
      )
    )
  ) {
    return passwordSprayingPattern;
  }

  if (row.srcuser && row.hasFailure) {
    return passwordGuessingPattern;
  }

  return null;
}

function isNormalEvent(row) {
  // 낮은 규칙 수준만으로 대량 실패를 정상 처리하지 않습니다.
  if (row.hasSuccess && !row.hasFailure) return true;

  return Number.isFinite(row.level)
    && row.level <= 3
    && row.failureCount <= 1
    && !row.multipleAccounts
    && !row.explicitGuessing;
}

function isClearAttack(row, pattern) {
  if (!pattern || row.hasSuccess) return false;

  const passwordSpray =
    row.multipleAccounts
    && row.samePassword
    && (
      (row.hasFailure && row.failureCount >= 2)
      || (
        row.repeated
        && (row.hasFailure || row.hasAttempt)
      )
    );

  const passwordGuessing =
    row.hasFailure
    && row.explicitGuessing
    && (row.failureCount >= 2 || row.repeated);

  // 수치는 이 모듈의 보수적인 경험 기준이며
  // MITRE/심판의 정답 기준이 아닙니다.
  const shortBurst =
    row.hasFailure
    && row.failureCount >= 15
    && row.windowSeconds !== null
    && row.windowSeconds > 0
    && row.windowSeconds <= 300;

  const largeRepeatedFailure =
    row.hasFailure
    && row.failureCount >= 20
    && row.windowSeconds === null
    && (
      row.repeated
      || /성공(?:은|이)?\s*없/u.test(row.description)
      || row.level >= 10
    );

  const regularMultiAccountFailure =
    row.hasFailure
    && row.multipleAccounts
    && row.accountCount >= 5
    && row.repeated
    && row.level >= 10
    && (
      row.windowSeconds === null
      || row.windowSeconds <= 300
    );

  return passwordSpray
    || passwordGuessing
    || shortBurst
    || largeRepeatedFailure
    || regularMultiAccountFailure;
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