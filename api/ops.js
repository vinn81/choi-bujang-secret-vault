import config from '../aleph.config.json' with { type: 'json' };
import verifiedPolicy from '../policy/verified-policy.json' with { type: 'json' };
import { decide, RULE_IDS } from '../src/decider.mjs';
import { detect, revocationProposal } from '../src/detect.mjs';
import { serviceHeaders, table } from '../src/device.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { authorizeNotesRequest, sendJson } from './notes.js';
import { withAccessLog } from '../src/access-log.mjs';

// 12단계: 탈환 작전실 요약 API(GET /api/ops)입니다. 로그인과 승인된 기기(학생)가 필요합니다.
// 각 항목에 출처를 붙입니다: server_run(이 요청 때 서버가 가상 요청으로 직접 실행), db(학습 DB 기록), not_run(미실행).
// 메모 본문·제목·토큰은 돌려주지 않고, 기록 ID는 앞뒤 4자만 남겨 가립니다. 수치는 함께 돌려주는 가린 기록 목록에서 셉니다.
const mask = value => (typeof value === 'string' && value.length > 8 ? `${value.slice(0, 4)}…${value.slice(-4)}` : '••••');
const short = value => (typeof value === 'string' ? value.slice(0, 7) : null);

async function readOwnRows(fetchImpl, supabaseUrl, key, name, select, owner, order) {
  const url = table(supabaseUrl, name);
  url.searchParams.set('select', select);
  url.searchParams.set('owner_id', `eq.${owner}`);
  if (order) url.searchParams.set('order', order);
  url.searchParams.set('limit', '50');
  const upstream = await fetchImpl(url, { method: 'GET', headers: serviceHeaders(key), redirect: 'error' });
  if (!upstream.ok) throw new Error('upstream_failed');
  const rows = await upstream.json();
  if (!Array.isArray(rows)) throw new Error('upstream_failed');
  return rows;
}

// 12단계 서버 요청 기록: 내 소유자 키로 남은 요청과 비로그인(소유자 없음) 요청을 최근 50건까지 읽습니다.
async function readAccessLog(fetchImpl, supabaseUrl, key, owner) {
  const url = table(supabaseUrl, 'access_log');
  url.searchParams.set('select', 'request_id,attack_id,method,route,status,owner_id,created_at');
  url.searchParams.set('or', `(owner_id.eq.${owner},owner_id.is.null)`);
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', '50');
  const upstream = await fetchImpl(url, { method: 'GET', headers: serviceHeaders(key), redirect: 'error' });
  if (!upstream.ok) throw new Error('upstream_failed');
  const rows = await upstream.json();
  if (!Array.isArray(rows)) throw new Error('upstream_failed');
  return rows;
}

const countBy = (rows, pick) => rows.reduce((counts, row) => {
  const key = pick(row);
  counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}, {});

async function deciderSummary() {
  const { normal, suspicious } = fixtureRequests();
  const run = async (stage, kind, name, expected, overrides) => {
    const requestId = crypto.randomUUID();
    const response = await decide({ ...normal, requestId, ...overrides });
    return { stage, kind, name, expected, decision: response.decision, reasonCode: response.reasonCode,
      requestId: response.requestId, checkedAt: new Date().toISOString(),
      matched: response.requestId === requestId && `${response.decision}:${response.reasonCode}`.startsWith(expected) };
  };
  const checks = [
    await run(6, 'normal', '등록 기기의 메모 한 건 읽기', 'allow', {}),
    await run(6, 'forbidden', '미등록 기기', 'deny:device_not_registered', { deviceRegistered: false }),
    await run(7, 'forbidden', '복합 이상 접속', 'step_up:step_up_required', { signals: suspicious.signals, recentEvents: suspicious.recentEvents }),
    await run(7, 'normal', '다시 확인한 복합 이상 접속', 'allow',
      { signals: suspicious.signals, recentEvents: suspicious.recentEvents, stepUp: { verified: true, authAgeSeconds: 60 } }),
    await run(8, 'forbidden', '메모 전체 목록', 'deny', { path: '/notes', route: 'GET /notes' }),
    await run(8, 'forbidden', '학생의 강사 공지 수정', 'deny:instructor_role_required',
      { service: 'notices', method: 'PUT', path: '/notices/demo', route: 'PUT /notices/:id' }),
  ];
  return { source: 'server_run', ruleIds: [...RULE_IDS], checks,
    liveEnforcement: { source: 'not_run', reason: '운영 엔진의 실제 판정 요청은 이 저장소에 연결되지 않았습니다.' } };
}

function detectionSummary() {
  const start = Date.UTC(2026, 9, 1);
  const reads = count => Array.from({ length: count }, (_, index) => ({
    at: new Date(start + index * 2000).toISOString(), method: 'GET', identity: { sub: 'learner_fixture' },
    deviceId: 'a'.repeat(16),
  }));
  const ordinary = detect(reads(30));
  const burst = detect(reads(121));
  const proposal = revocationProposal(reads(121));
  const checkedAt = new Date().toISOString();
  return {
    detection: { source: 'server_run', checks: [
      { stage: 9, kind: 'normal', name: '같은 사용자 조회 30건', expected: 'observe', action: ordinary.action,
        requestId: crypto.randomUUID(), checkedAt, matched: ordinary.action === 'observe' },
      { stage: 9, kind: 'forbidden', name: '10분 안 조회 121건', expected: 'propose_revocation', action: burst.action,
        reasonCode: burst.reasonCode, requestId: crypto.randomUUID(), checkedAt,
        matched: burst.action === 'propose_revocation' && burst.reasonCode === 'burst_read' },
    ], liveEvents: { source: 'not_run', reason: '운영 반 엔진의 사건 전달이 연결되지 않았습니다.' } },
    proposal: { source: 'server_run', reasonCode: proposal?.reasonCode ?? null, deviceTargeted: Boolean(proposal?.deviceId),
      readsInWindow: proposal?.readsInWindow ?? 0 },
  };
}

export async function handleOps(request, response, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  verifyAuthorization,
  verifyDeviceSession,
  now = Date.now,
} = {}) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return sendJson(response, 405, { error: 'method_not_allowed' });
  }
  const auth = await authorizeNotesRequest(request, response, { env, verifyAuthorization, fetchImpl, verifyDeviceSession });
  if (!auth) return undefined;
  const owner = auth.login.userId;
  try {
    const [credentials, sessions, audit, access] = await Promise.all([
      readOwnRows(fetchImpl, auth.supabaseUrl, auth.supabaseSecretKey, 'device_credentials', 'id,approved,created_at', owner, 'created_at.desc'),
      readOwnRows(fetchImpl, auth.supabaseUrl, auth.supabaseSecretKey, 'device_sessions', 'expires_at', owner, 'expires_at.desc'),
      readOwnRows(fetchImpl, auth.supabaseUrl, auth.supabaseSecretKey, 'notes_restore_audit', 'note_id,result,restored_at', owner, 'restored_at.desc'),
      // 요청 기록 표를 읽지 못하면(표 미생성 등) 작전실 전체를 멈추지 않고 이 항목만 미실행으로 둡니다.
      readAccessLog(fetchImpl, auth.supabaseUrl, auth.supabaseSecretKey, owner).catch(() => null),
    ]);
    const devices = credentials.map(row => ({ id: mask(row.id), approved: row.approved === true, createdAt: row.created_at }));
    const activeSessions = sessions.filter(row => Date.parse(row.expires_at) > now()).length;
    const auditRecords = audit.map(row => ({ note: mask(row.note_id), result: row.result ?? 'restored', at: row.restored_at }));
    // 요청 ID는 묶음·재확인 표의 요청 ID와 대조할 수 있게 그대로 두고, 소유자는 본인/비로그인으로만 표시합니다.
    const requestRecords = (access ?? []).map(row => ({ requestId: row.request_id, attackId: row.attack_id ?? null,
      method: row.method, route: row.route, status: row.status, login: row.owner_id ? 'self' : 'anonymous', at: row.created_at }));
    const { detection, proposal } = detectionSummary();
    return sendJson(response, 200, {
      checkedAt: new Date(now()).toISOString(),
      decider: await deciderSummary(),
      detection,
      revocation: {
        proposal,
        devices: { source: 'db', approved: devices.filter(item => item.approved).length,
          pending: devices.filter(item => !item.approved).length, activeSessions, records: devices },
        liveRevocation: { source: 'not_run', reason: '회수 제안을 집행하는 운영 엔진이 연결되지 않았습니다.' },
      },
      requests: access === null ? { source: 'not_run', reason: '서버 요청 기록(access_log)을 읽지 못했습니다.', total: 0, byStatus: {}, anonymous: 0, records: [] } : { source: 'db', total: requestRecords.length, byStatus: countBy(requestRecords, item => item.status),
        anonymous: requestRecords.filter(item => item.login === 'anonymous').length, records: requestRecords },
      restore: {
        verifiedPolicy: { source: 'repository', label: verifiedPolicy.label, commit: short(verifiedPolicy.verifiedCommit),
          verifiedAt: verifiedPolicy.verifiedAt },
        deployment: { source: env.VERCEL_GIT_COMMIT_SHA ? 'deployment' : 'not_run', commit: short(env.VERCEL_GIT_COMMIT_SHA),
          step: config.step, restoreRoute: config.restoreRoute },
        audit: { source: 'db', total: auditRecords.length, byResult: countBy(auditRecords, item => item.result), records: auditRecords },
      },
    });
  } catch {
    return sendJson(response, 500, { error: 'ops_unavailable' });
  }
}

export default withAccessLog('/api/ops', (request, response) => handleOps(request, response));
