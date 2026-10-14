// 자료 빼돌리기(외부 유출) 판단 결과를 ZTNA 판정기 앞단의 임시 목적지 거부 규칙과 알림으로 바꿉니다.
// decide.mjs 는 판단만 하고, 파일 쓰기와 판정기 연결은 이 파일에서만 합니다.
// 심판이 불러오는 파일은 decide.mjs 하나이므로 이 파일은 import 를 써도 됩니다.
// 이 모듈은 출발 주소가 아니라 자료가 나가는 목적지(data.dstip)를 막습니다. 기존 출발 주소 규칙(checkTemporaryDeny)은 그대로 둡니다.
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MODULE_KEY = 'exfiltration';
const BLOCK_TTL_MS = 15 * 60 * 1000;
const IP_ADDRESS = /^(?:\d{1,3}\.){3}\d{1,3}$/u;
const ACCOUNT = /^[A-Za-z0-9._-]{1,64}$/u;

function oneLine(value) {
  return String(value ?? '').replace(/[\r\n]+/gu, ' ').trim();
}

function validAddress(value) {
  if (typeof value !== 'string' || !IP_ADDRESS.test(value)) return false;
  return value.split('.').every((part) => Number(part) <= 255);
}

function ruleIdFor(destinationAddress, alertIds) {
  const digest = createHash('sha256').update(`${destinationAddress}\0${alertIds.join(',')}`).digest('hex').slice(0, 12);
  return `xdr.exfiltration.${digest}`;
}

export async function publishXdrResult({ root, moduleKey = MODULE_KEY, fixture, result, now = new Date() }) {
  if (moduleKey !== MODULE_KEY) return null;
  if (!Array.isArray(fixture?.alerts) || !Array.isArray(result?.decisions)) {
    throw new TypeError('invalid_exfiltration_result');
  }

  const generatedAt = new Date(now);
  if (Number.isNaN(generatedAt.getTime())) throw new TypeError('invalid_generated_at');
  const expiresAt = new Date(generatedAt.getTime() + BLOCK_TTL_MS).toISOString();
  const alertsById = new Map(fixture.alerts.map((alert) => [alert?.id, alert]));
  const evidenceByDestination = new Map();
  const logLines = [];
  // 정상 이벤트(record)가 향한 목적지(자료실·수업 자료 주소 등)는 정상 사용자가 쓰는 곳이라 거부 규칙에 넣지 않습니다.
  const normalDestinations = new Set(result.decisions
    .filter((decision) => decision?.action === 'record')
    .map((decision) => alertsById.get(decision.alertId)?.data?.dstip)
    .filter(validAddress));

  for (const decision of result.decisions) {
    // 차단 후보(block)만 거부 규칙이 되고, 애매한 건(alert)은 알림만 남깁니다.
    // 정상 이벤트(record)는 규칙도 알림도 만들지 않습니다.
    if (decision?.action !== 'block' && decision?.action !== 'alert') continue;

    const alert = alertsById.get(decision.alertId);
    if (!alert) continue;
    const destinationAddress = validAddress(alert.data?.dstip) ? alert.data.dstip : null;

    // 전송량·파일 수·설명 문장은 알림에 남기지 않고, 판단 이유와 출발 주소·계정·목적지만 남깁니다.
    const logEntry = {
      at: generatedAt.toISOString(),
      moduleKey,
      alertId: alert.id,
      action: decision.action,
      confidence: decision.confidence,
      reason: oneLine(decision.reason),
      sourceAddress: validAddress(alert.data?.srcip) ? alert.data.srcip : null,
      account: ACCOUNT.test(alert.data?.srcuser ?? '') ? alert.data.srcuser : null,
      destinationAddress,
    };

    if (decision.action === 'block' && !destinationAddress) {
      logEntry.ruleSkipped = 'no_destination';
    } else if (decision.action === 'block' && normalDestinations.has(destinationAddress)) {
      logEntry.ruleSkipped = 'normal_destination';
    } else if (decision.action === 'block') {
      logEntry.expiresAt = expiresAt;
      const ids = evidenceByDestination.get(destinationAddress) ?? [];
      ids.push(alert.id);
      evidenceByDestination.set(destinationAddress, ids);
    }

    logLines.push(JSON.stringify(logEntry));
  }

  // 같은 목적지의 근거 경보는 규칙 하나에 모읍니다.
  const rules = [...evidenceByDestination].map(([destinationAddress, evidenceAlertIds]) => ({
    ruleId: ruleIdFor(destinationAddress, evidenceAlertIds),
    action: 'deny',
    destinationAddress,
    expiresAt,
    evidenceAlertIds,
  }));

  const rulesDocument = {
    schema: 'aleph.xdr.deny-rules.v1',
    moduleKey,
    target: 'destination',
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

// 엔진이 확인한 목적지 주소가 만료 전 거부 규칙에 있으면 deny, 아니면 pass 입니다.
export function checkDestinationDeny({ trustedDestinationAddress, at = new Date() }, rulesDocument) {
  const checkedAt = new Date(at);
  if (!validAddress(trustedDestinationAddress) || Number.isNaN(checkedAt.getTime())) {
    return { action: 'pass' };
  }
  const rule = rulesDocument?.rules?.find((item) => item?.destinationAddress === trustedDestinationAddress
    && Date.parse(item.expiresAt) > checkedAt.getTime());
  if (!rule) return { action: 'pass' };
  return {
    action: 'deny',
    ruleId: rule.ruleId,
    expiresAt: rule.expiresAt,
    evidenceAlertIds: [...rule.evidenceAlertIds],
  };
}

// 운영 엔진의 호출부에서 사용합니다. request에 목적지 필드를 추가하지 않습니다.
// trustedDestinationAddress는 엔진이 확인한 별도 값이어야 하며, denyResponse와 등록 목록도 운영 엔진이 제공합니다.
// 막지 않은 요청은 기존 판정기(decide)로 그대로 넘깁니다. 기존 판정기의 거부를 허용으로 바꾸지 않습니다.
export async function decideWithDestinationDeny({
  request,
  trustedDestinationAddress,
  rulesDocument,
  decide,
  denyResponse,
  allowedReasonCodes,
  allowedRuleIds,
  at = new Date(),
}) {
  if (typeof decide !== 'function' || typeof denyResponse !== 'function'
      || !Array.isArray(allowedReasonCodes) || !Array.isArray(allowedRuleIds)) {
    throw new TypeError('xdr_engine_configuration_required');
  }
  if (!validAddress(trustedDestinationAddress)) {
    throw new TypeError('xdr_verified_destination_address_required');
  }
  if (Number.isNaN(new Date(at).getTime())) throw new TypeError('invalid_check_time');
  if (rulesDocument?.schema !== 'aleph.xdr.deny-rules.v1' || !Array.isArray(rulesDocument.rules)) {
    throw new TypeError('invalid_deny_rules');
  }

  const match = checkDestinationDeny({ trustedDestinationAddress, at }, rulesDocument);
  if (match.action !== 'deny') return decide(request);

  const response = await denyResponse(request, match);
  const keys = response && typeof response === 'object' ? Object.keys(response).sort().join(',') : '';
  if (keys !== 'decision,reasonCode,requestId,ruleIds,schema'
      || response.schema !== 'aleph.decision.v1'
      || response.requestId !== request?.requestId
      || response.decision !== 'deny'
      || !allowedReasonCodes.includes(response.reasonCode)
      || !Array.isArray(response.ruleIds) || response.ruleIds.length === 0
      || !response.ruleIds.every((id) => allowedRuleIds.includes(id))) {
    throw new TypeError('xdr_registered_deny_response_required');
  }
  return response;
}

// 확인용: 시험 경보를 decide 에 다시 흘려 규칙과 알림을 만들고, 목적지별 통과 여부를 보여 줍니다.
const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const { decide } = await import('./decide.mjs');
  const fixture = JSON.parse(await readFile(join(root, 'xdr', 'fixtures', `${MODULE_KEY}.json`), 'utf8'));

  const decisions = [];
  for (const alert of fixture.alerts) {
    decisions.push({ alertId: alert.id, ...await decide(alert) });
  }
  const rulesDocument = await publishXdrResult({ root, fixture, result: { decisions } });

  const counts = { block: 0, alert: 0, record: 0 };
  for (const d of decisions) counts[d.action] += 1;
  process.stdout.write(`판단: block ${counts.block} · alert ${counts.alert} · record ${counts.record}\n`);
  process.stdout.write(`목적지 거부 규칙 ${rulesDocument.rules.length}개 (만료 ${rulesDocument.rules[0]?.expiresAt ?? '-'})\n`);

  for (const alert of fixture.alerts) {
    const check = checkDestinationDeny({ trustedDestinationAddress: alert.data?.dstip }, rulesDocument);
    const action = decisions.find((d) => d.alertId === alert.id).action;
    const evidence = check.action === 'deny' ? ` 근거 ${check.evidenceAlertIds.join(',')}` : '';
    process.stdout.write(`${alert.id} ${action.padEnd(6)} → ${alert.data?.dstip ?? '(목적지 없음)'} ${check.action}${evidence}\n`);
  }
}
