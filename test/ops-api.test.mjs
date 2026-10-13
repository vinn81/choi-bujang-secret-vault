import assert from 'node:assert/strict';
import test from 'node:test';
import { handleOps } from '../api/ops.js';

// 12단계 탈환 작전실 API를 가상 자료로 시험합니다. 화면이 쓰는 수치가 함께 돌려주는 가린 기록과 맞는지 봅니다.
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const env = { SUPABASE_URL: 'https://yhjbdzvzdncohckdocao.supabase.co', SUPABASE_SECRET_KEY: 'test-only-placeholder' };
const verifyAuthorization = async header => ({
  'Bearer token-a': { kind: 'student', userId: USER_A },
  'Bearer token-b': { kind: 'student', userId: USER_B },
})[header] ?? null;
const NOW = Date.parse('2026-10-13T06:00:00Z');

function fakeDb() {
  const tables = {
    device_credentials: [
      { id: 'cred-b-approved-0001', owner_id: USER_B, approved: true, created_at: '2026-10-13T05:00:00Z', public_key: 'secret-like-public' },
      { id: 'cred-b-pending-0002', owner_id: USER_B, approved: false, created_at: '2026-10-13T05:10:00Z', public_key: 'x' },
      { id: 'cred-a-approved-0003', owner_id: USER_A, approved: true, created_at: '2026-10-13T05:20:00Z', public_key: 'x' },
    ],
    device_sessions: [
      { token_sha256: 'f'.repeat(64), owner_id: USER_B, expires_at: '2026-10-13T06:20:00Z' },
      { token_sha256: 'e'.repeat(64), owner_id: USER_B, expires_at: '2026-10-13T05:20:00Z' },
    ],
    notes_restore_audit: [
      { note_id: 'e1a96dca-6a1d-4a52-bee4-d8f63f0f8e5f', owner_id: USER_B, result: 'restored', restored_at: '2026-10-13T04:40:25Z' },
      { note_id: 'e1a96dca-6a1d-4a52-bee4-d8f63f0f8e5f', owner_id: USER_A, result: 'backup_not_found', restored_at: '2026-10-13T05:12:12Z' },
    ],
    access_log: [
      { request_id: 'aaaaaaaa-0000-4000-8000-000000000001', attack_id: 'anonymous_notes_list', method: 'GET', route: '/api/notes', status: 401, owner_id: null, created_at: '2026-10-13T05:50:00Z' },
      { request_id: 'aaaaaaaa-0000-4000-8000-000000000002', attack_id: null, method: 'GET', route: '/api/ops', status: 200, owner_id: USER_B, created_at: '2026-10-13T05:51:00Z' },
      { request_id: 'aaaaaaaa-0000-4000-8000-000000000003', attack_id: null, method: 'GET', route: '/api/notes', status: 200, owner_id: USER_A, created_at: '2026-10-13T05:52:00Z' },
    ],
  };
  return {
    async fetch(url) {
      const endpoint = new URL(url);
      const name = endpoint.pathname.split('/').at(-1);
      const fields = endpoint.searchParams.get('select').split(',');
      const either = /^\(owner_id\.eq\.([0-9a-f-]+),owner_id\.is\.null\)$/u.exec(endpoint.searchParams.get('or') ?? '');
      const owner = either ? either[1] : endpoint.searchParams.get('owner_id')?.replace(/^eq\./u, '');
      return Response.json(tables[name].filter(row => row.owner_id === owner || (either && row.owner_id === null))
        .map(row => Object.fromEntries(fields.map(field => [field, row[field]]))));
    },
  };
}

function output() {
  return { headers: new Map(), statusCode: 200, body: undefined,
    setHeader(name, value) { this.headers.set(name.toLowerCase(), value); },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }, end() { return this; } };
}

const ops = async (headers, extra = {}) => {
  const out = output();
  await handleOps({ method: 'GET', headers, ...extra }, out, { env, fetchImpl: fakeDb().fetch, verifyAuthorization,
    verifyDeviceSession: async () => true, now: () => NOW });
  return out;
};

test('작전실 수치는 함께 돌려주는 가린 기록 목록과 맞고, 다른 사용자 기록은 섞이지 않는다', async () => {
  const out = await ops({ authorization: 'Bearer token-b' });
  assert.equal(out.statusCode, 200);
  const { devices, liveRevocation } = out.body.revocation;
  assert.equal(devices.approved + devices.pending, devices.records.length);
  assert.equal(devices.approved, devices.records.filter(item => item.approved).length);
  assert.deepEqual([devices.approved, devices.pending, devices.activeSessions], [1, 1, 1]);
  const { audit } = out.body.restore;
  assert.equal(audit.total, audit.records.length);
  assert.equal(Object.values(audit.byResult).reduce((sum, count) => sum + count, 0), audit.total);
  assert.deepEqual(audit.byResult, { restored: 1 });
  assert.equal(liveRevocation.source, 'not_run');
});

test('기록 ID는 가리고 메모 본문·공개키·토큰 지문은 돌려주지 않는다', async () => {
  const out = await ops({ authorization: 'Bearer token-b' });
  const text = JSON.stringify(out.body);
  assert.equal(out.body.restore.audit.records[0].note, 'e1a9…8e5f');
  assert.equal(out.body.revocation.devices.records[0].id, 'cred…0001');
  for (const hidden of ['e1a96dca-6a1d', 'cred-b-approved', 'secret-like-public', 'f'.repeat(64), 'content', 'title', 'public_key']) {
    assert.equal(text.includes(hidden), false, hidden);
  }
});

test('판정기·탐지는 서버가 이번 요청에서 실행한 결과이고, 운영 연결은 미실행으로 표시한다', async () => {
  const out = await ops({ authorization: 'Bearer token-b' });
  const { decider, detection } = out.body;
  assert.equal(decider.source, 'server_run');
  assert.deepEqual(decider.ruleIds, ['starter.deny', 'device_registered', 'step_up_required', 'resource_zone']);
  assert.ok(decider.checks.every(item => item.matched), JSON.stringify(decider.checks));
  assert.ok(detection.checks.every(item => item.matched));
  for (const item of [...decider.checks, ...detection.checks]) {
    assert.match(item.requestId, /^[0-9a-f-]{36}$/u);
    assert.ok([6, 7, 8, 9].includes(item.stage) && ['normal', 'forbidden'].includes(item.kind));
    assert.ok(Number.isFinite(Date.parse(item.checkedAt)));
  }
  assert.ok(decider.checks.some(item => item.kind === 'normal') && decider.checks.some(item => item.kind === 'forbidden'));
  assert.equal(decider.liveEnforcement.source, 'not_run');
  assert.equal(detection.liveEvents.source, 'not_run');
  assert.equal(out.body.restore.verifiedPolicy.commit, '4093403');
});

test('승인된 기기가 없으면 403, 무로그인 401, GET이 아니면 405', async () => {
  const denied = output();
  await handleOps({ method: 'GET', headers: { authorization: 'Bearer token-b' } }, denied,
    { env, fetchImpl: fakeDb().fetch, verifyAuthorization, verifyDeviceSession: async () => false });
  assert.equal(denied.statusCode, 403);
  assert.equal((await ops({})).statusCode, 401);
  assert.equal((await ops({ authorization: 'Bearer token-b' }, { method: 'POST' })).statusCode, 405);
});

test('서버 요청 기록은 본인·비로그인 기록만 돌려주고, 수치는 같은 목록에서 센다', async () => {
  const out = await ops({ authorization: 'Bearer token-b' });
  const { requests } = out.body;
  assert.equal(requests.source, 'db');
  assert.equal(requests.total, requests.records.length);
  assert.deepEqual(requests.records.map(item => item.requestId),
    ['aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002']);
  assert.equal(requests.anonymous, requests.records.filter(item => item.login === 'anonymous').length);
  assert.equal(Object.values(requests.byStatus).reduce((sum, count) => sum + count, 0), requests.total);
  assert.equal(requests.records[0].attackId, 'anonymous_notes_list');
  assert.equal(JSON.stringify(requests).includes(USER_B), false);
});

test('요청 기록 표를 읽지 못해도 작전실은 응답하고 그 항목만 미실행으로 표시한다', async () => {
  const db = fakeDb();
  const out = output();
  await handleOps({ method: 'GET', headers: { authorization: 'Bearer token-b' } }, out, { env, verifyAuthorization,
    verifyDeviceSession: async () => true, now: () => NOW,
    fetchImpl: async url => (new URL(url).pathname.endsWith('/access_log') ? new Response('{}', { status: 404 }) : db.fetch(url)) });
  assert.equal(out.statusCode, 200);
  assert.equal(out.body.requests.source, 'not_run');
  assert.equal(out.body.requests.total, out.body.requests.records.length);
  assert.equal(out.body.restore.audit.source, 'db');
});
