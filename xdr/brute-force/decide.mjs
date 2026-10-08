import { readFile } from 'node:fs/promises';

const patternsDocument = JSON.parse(
  await readFile(new URL('./patterns.json', import.meta.url), 'utf8'),
);

const [passwordGuessingPattern, passwordSprayingPattern] = patternsDocument.patterns;
const MULTI_ACCOUNT_SIGNAL = /여러 계정|서로 다른 계정|계정\s*\d+개|두 계정|계정 이름을 바꿔|같은 비밀번호/;
const FAILURE_SIGNAL = /로그인 실패|비밀번호.*실패|실패.*로그인|실패가|실패\s*\d+건/;

function actionFor(confidence) {
  if (confidence >= 0.85) return 'block';
  if (confidence >= 0.5) return 'alert';
  return 'record';
}

function extractAlert(alert) {
  return {
    timestamp: alert?.timestamp,
    srcip: alert?.data?.srcip,
    srcuser: alert?.data?.srcuser,
    level: alert?.rule?.level,
    description: alert?.rule?.description,
  };
}

function matchPattern(alert, row) {
  const techniques = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
  if (!techniques.includes('T1110') || typeof row.description !== 'string') return null;

  if (MULTI_ACCOUNT_SIGNAL.test(row.description)) return passwordSprayingPattern;
  if (row.srcip && row.srcuser && FAILURE_SIGNAL.test(row.description)) return passwordGuessingPattern;
  return null;
}

function isClearAttack(alert, row, pattern) {
  if (!pattern || !Number.isFinite(row.level) || row.level < 10) return false;

  const count = Number.parseInt(alert?.data?.count, 10);
  const hasLargeFailureCount = Number.isFinite(count) && count >= 15;
  const hasMultipleAccounts = MULTI_ACCOUNT_SIGNAL.test(row.description);
  return hasLargeFailureCount || hasMultipleAccounts;
}

async function askJev(row, pattern) {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.typesafe.ai/v1/systemone', {
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
          matchedPattern: {
            name: pattern.name,
            condition: pattern.condition,
          },
        }),
        questions: {
          is_brute_force: {
            type: 'noul',
            instructions: '이 경보가 일상적인 로그인 실수가 아니라 근거 패턴에 해당하는 무차별 로그인 공격인가?',
            criteria: {
              true: '짧은 시간의 반복 로그인 실패 또는 여러 계정에 같은 비밀번호를 대입한 공격 신호가 있다.',
              false: '소수의 실패 뒤 성공했거나 정상 로그인·로그아웃·세션 활동이다.',
            },
          },
        },
      }),
    });

    if (!response.ok) return null;
    const body = await response.json();
    const confidence = body?.answers?.is_brute_force?.noul;
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
    return confidence;
  } catch {
    return null;
  }
}

export async function decide(alert) {
  const row = extractAlert(alert);
  const pattern = matchPattern(alert, row);

  if (!pattern) {
    const confidence = 0;
    return { action: actionFor(confidence), confidence, reason: '근거 패턴 없음' };
  }

  if (isClearAttack(alert, row, pattern)) {
    const confidence = 0.95;
    return { action: actionFor(confidence), confidence, reason: pattern.name };
  }

  const jevConfidence = await askJev(row, pattern);
  const confidence = jevConfidence ?? 0.5;
  return { action: actionFor(confidence), confidence, reason: pattern.name };
}
