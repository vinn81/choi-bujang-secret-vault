// 웹 주입 판단 결과를 ZTNA 판정기 앞단의 임시 거부 규칙과 알림으로 바꿉니다.
// decide.mjs 는 판단만 하고, 파일 쓰기와 판정기 연결은 이 파일에서만 합니다.
// 심판이 불러오는 파일은 decide.mjs 하나이므로 이 파일은 import 를 써도 됩니다.
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decideWithTemporaryDeny } from '../brute-force/connect.mjs';

export { decideWithTemporaryDeny };

const MODULE_KEY = 'web-injection';
const BLOCK_TTL_MS = 15 * 60 * 1000;
const IP_ADDRESS = /^(?:\d{1,3}\.){3}\d{1,3}$/u;

function oneLine(value) {
  return String(value ?? '').replace(/[\r\n]+/gu, ' ').trim();
}

function validSourceAddress(value) {
  if (typeof value !== 'string' || !IP_ADDRESS.test(value)) return false;
  return value.split('.').every((part) => Number(part) <= 255);
}

function ruleIdFor(sourceAddress, alertIds) {
  const digest = createHash('sha256').update(`${sourceAddress}\0${alertIds.join(',')}`).digest('hex').slice(0, 12);
  return `xdr.web_injection.${digest}`;
}

export async function publishXdrResult({ root, moduleKey = MODULE_KEY, fixture, result, now = new Date() }) {
  if (moduleKey !== MODULE_KEY) return null;
  if (!Array.isArray(fixture?.alerts) || !Array.isArray(result?.decisions)) {
    throw new TypeError('invalid_web_injection_result');
  }

  const generatedAt = new Date(now);
  if (Number.isNaN(generatedAt.getTime())) throw new TypeError('invalid_generated_at');
  const expiresAt = new Date(generatedAt.getTime() + BLOCK_TTL_MS).toISOString();
  const alertsById = new Map(fixture.alerts.map((alert) => [alert?.id, alert]));
  const evidenceByAddress = new Map();
  const logLines = [];

  for (const decision of result.decisions) {
    // 차단 후보(block)만 거부 규칙이 되고, 애매한 건(alert)은 알림만 남깁니다.
    // 정상 이벤트(record)는 규칙도 알림도 만들지 않습니다.
    if (decision?.action !== 'block' && decision?.action !== 'alert') continue;

    const alert = alertsById.get(decision.alertId);
    const sourceAddress = alert?.data?.srcip;
    if (!alert || !validSourceAddress(sourceAddress)) continue;

    const logEntry = {
      at: generatedAt.toISOString(),
      moduleKey,
      alertId: alert.id,
      action: decision.action,
      confidence: decision.confidence,
      reason: oneLine(decision.reason),
      sourceAddress,
    };

    if (decision.action === 'block') {
      logEntry.expiresAt = expiresAt;
      const ids = evidenceByAddress.get(sourceAddress) ?? [];
      ids.push(alert.id);
      evidenceByAddress.set(sourceAddress, ids);
    }

    // 요청 주소(url)에는 주입 문자열이나 비밀값이 섞일 수 있어 알림에 남기지 않습니다.
    logLines.push(JSON.stringify(logEntry));
  }

  // 같은 주소의 근거 경보는 규칙 하나에 모읍니다.
  const rules = [...evidenceByAddress].map(([sourceAddress, evidenceAlertIds]) => ({
    ruleId: ruleIdFor(sourceAddress, evidenceAlertIds),
    action: 'deny',
    sourceAddress,
    expiresAt,
    evidenceAlertIds,
  }));

  const rulesDocument = {
    schema: 'aleph.xdr.deny-rules.v1',
    moduleKey,
    generatedAt: generatedAt.toISOString(),
    rules,
  };
  await writeFile(join(root, 'xdr', moduleKey, 'deny-rules.json'), `${JSON.stringify(rulesDocument, null, 2)}\n`, 'utf8');

  if (logLines.length) {
    await appendFile(join(root, 'xdr', 'alerts.log'), `${logLines.join('\n')}\n`, 'utf8');
  }

  return rulesDocument;
}

export async function loadDenyRules(root) {
  const raw = await readFile(join(root, 'xdr', MODULE_KEY, 'deny-rules.json'), 'utf8');
  const document = JSON.parse(raw);
  if (document?.schema !== 'aleph.xdr.deny-rules.v1' || !Array.isArray(document.rules)) {
    throw new TypeError('invalid_deny_rules');
  }
  return document;
}

// 확인용: 시험 경보를 decide 에 다시 흘려 규칙과 알림을 만들고, 주소별 통과 여부를 보여 줍니다.
const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const { decide } = await import('./decide.mjs');
  const { checkTemporaryDeny } = await import('../brute-force/connect.mjs');
  const fixture = JSON.parse(await readFile(join(root, 'xdr', 'fixtures', `${MODULE_KEY}.json`), 'utf8'));

  const decisions = [];
  for (const alert of fixture.alerts) {
    decisions.push({ alertId: alert.id, ...await decide(alert) });
  }
  const rulesDocument = await publishXdrResult({ root, fixture, result: { decisions } });

  const counts = { block: 0, alert: 0, record: 0 };
  for (const d of decisions) counts[d.action] += 1;
  process.stdout.write(`판단: block ${counts.block} · alert ${counts.alert} · record ${counts.record}\n`);
  process.stdout.write(`거부 규칙 ${rulesDocument.rules.length}개 (만료 ${rulesDocument.rules[0]?.expiresAt ?? '-'})\n`);

  for (const alert of fixture.alerts) {
    const check = checkTemporaryDeny({ trustedSourceAddress: alert.data?.srcip }, rulesDocument);
    const action = decisions.find((d) => d.alertId === alert.id).action;
    const evidence = check.action === 'deny' ? ` 근거 ${check.evidenceAlertIds.join(',')}` : '';
    process.stdout.write(`${alert.id} ${action.padEnd(6)} ${alert.data?.srcip} → ${check.action}${evidence}\n`);
  }
}
