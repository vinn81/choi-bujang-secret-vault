import { createHash } from 'node:crypto';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BLOCK_TTL_MS = 15 * 60 * 1000;
const IP_ADDRESS = /^(?:\d{1,3}\.){3}\d{1,3}$/u;

function oneLine(value) {
  return String(value ?? '').replace(/[\r\n]+/gu, ' ').trim();
}

function validSourceAddress(value) {
  if (typeof value !== 'string' || !IP_ADDRESS.test(value)) return false;
  return value.split('.').every((part) => Number(part) <= 255);
}

function ruleIdFor(sourceAddress, alertId) {
  const digest = createHash('sha256').update(`${sourceAddress}\0${alertId}`).digest('hex').slice(0, 12);
  return `xdr.brute_force.${digest}`;
}

export async function publishXdrResult({ root, moduleKey, fixture, result, now = new Date() }) {
  if (moduleKey !== 'brute-force') return null;
  if (!Array.isArray(fixture?.alerts) || !Array.isArray(result?.decisions)) {
    throw new TypeError('invalid_brute_force_result');
  }

  const generatedAt = new Date(now);
  if (Number.isNaN(generatedAt.getTime())) throw new TypeError('invalid_generated_at');
  const expiresAt = new Date(generatedAt.getTime() + BLOCK_TTL_MS).toISOString();
  const alertsById = new Map(fixture.alerts.map((alert) => [alert?.id, alert]));
  const denyRules = [];
  const logLines = [];

  for (const decision of result.decisions) {
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
      denyRules.push({
        ruleId: ruleIdFor(sourceAddress, alert.id),
        action: 'deny',
        sourceAddress,
        expiresAt,
        evidenceAlertIds: [alert.id],
      });
    }

    logLines.push(JSON.stringify(logEntry));
  }

  const rulesDocument = {
    schema: 'aleph.xdr.deny-rules.v1',
    moduleKey,
    generatedAt: generatedAt.toISOString(),
    rules: denyRules,
  };
  const rulesPath = join(root, 'xdr', moduleKey, 'deny-rules.json');
  await writeFile(rulesPath, `${JSON.stringify(rulesDocument, null, 2)}\n`, 'utf8');

  if (logLines.length) {
    await appendFile(join(root, 'xdr', 'alerts.log'), `${logLines.join('\n')}\n`, 'utf8');
  }

  return rulesDocument;
}

export async function loadDenyRules(root) {
  const raw = await readFile(join(root, 'xdr', 'brute-force', 'deny-rules.json'), 'utf8');
  const document = JSON.parse(raw);
  if (document?.schema !== 'aleph.xdr.deny-rules.v1' || !Array.isArray(document.rules)) {
    throw new TypeError('invalid_deny_rules');
  }
  return document;
}

// trustedSourceAddress는 브라우저 요청이 아니라 ZTNA 앞단이 확인한 주소만 받습니다.
export function checkTemporaryDeny({ trustedSourceAddress, at = new Date() }, rulesDocument) {
  const checkedAt = new Date(at);
  if (!validSourceAddress(trustedSourceAddress) || Number.isNaN(checkedAt.getTime())) {
    return { action: 'pass' };
  }

  const rule = rulesDocument?.rules?.find((item) => item?.sourceAddress === trustedSourceAddress
    && Date.parse(item.expiresAt) > checkedAt.getTime());
  if (!rule) return { action: 'pass' };

  return {
    action: 'deny',
    ruleId: rule.ruleId,
    expiresAt: rule.expiresAt,
    evidenceAlertIds: [...rule.evidenceAlertIds],
  };
}
