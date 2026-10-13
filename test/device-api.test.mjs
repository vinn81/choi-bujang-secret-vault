import assert from 'node:assert/strict';
import test from 'node:test';
import { handleNotes } from '../api/notes.js';
import { handleDeviceRegister, handleDeviceVerify } from '../src/device-flow.mjs';
import { sha256 } from '../src/device.mjs';

// 11단계 기기 승인 흐름을 가상 자료로 시험합니다. 패스키 서명 검증은 가짜 함수로 바꿔 끼웁니다.
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_A = '11111111-1111-4111-8111-111111111111';
const JUDGE = '33333333-3333-4333-8333-333333333333';
const env = { SUPABASE_URL: 'https://yhjbdzvzdncohckdocao.supabase.co', SUPABASE_SECRET_KEY: 'test-only-placeholder' };
const verifyAuthorization = async header => ({
  'Bearer token-a': { kind: 'student', userId: USER_A },
  'Bearer token-b': { kind: 'student', userId: USER_B },
  'Bearer judge-a': { kind: 'judge', userId: JUDGE, runId: '44444444-4444-4444-8444-444444444444', identity: 'a' },
})[header] ?? null;

function fakeDb() {
  const tables = { notes: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', owner_id: USER_B, title: 'B 메모', content: 'B 가상 내용', created_at: '2026-10-13T00:00:00Z' }],
    device_credentials: [], device_challenges: [], device_sessions: [] };
  const calls = [];
  const matches = (row, params) => [...params].every(([key, value]) => {
    if (['select', 'order', 'limit'].includes(key)) return true;
    if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
    return true;
  });
  return {
    tables, calls,
    async fetch(url, init) {
      const endpoint = new URL(url);
      const name = endpoint.pathname.split('/').at(-1);
      calls.push(`${init.method} ${name}`);
      const rows = tables[name];
      const selected = rows.filter(row => matches(row, endpoint.searchParams));
      if (init.method === 'POST') { rows.push(JSON.parse(init.body)); return new Response(null, { status: 201 }); }
      if (init.method === 'PATCH') { selected.forEach(row => Object.assign(row, JSON.parse(init.body))); return new Response(null, { status: 204 }); }
      if (init.method === 'DELETE') { tables[name] = rows.filter(row => !selected.includes(row)); return new Response(null, { status: 204 }); }
      return Response.json(selected.map(row => ({ ...row })));
    },
  };
}

const fakeWebAuthn = ({ verified = true } = {}) => ({
  generateRegistrationOptions: async () => ({ challenge: 'register-challenge' }),
  verifyRegistrationResponse: async ({ expectedChallenge }) => ({ verified: verified && expectedChallenge === 'register-challenge',
    registrationInfo: { credential: { id: 'cred-b', publicKey: new Uint8Array([1, 2, 3]), counter: 0 } } }),
  generateAuthenticationOptions: async () => ({ challenge: 'verify-challenge' }),
  verifyAuthenticationResponse: async ({ expectedChallenge }) => ({ verified: verified && expectedChallenge === 'verify-challenge',
    authenticationInfo: { newCounter: 1 } }),
});

function output() {
  return { headers: new Map(), statusCode: 200, body: undefined,
    setHeader(name, value) { this.headers.set(name.toLowerCase(), value); },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }, end() { return this; } };
}

const call = async (handler, db, headers, body, extra = {}) => {
  const out = output();
  await handler({ method: 'POST', headers, body }, out, { env, fetchImpl: db.fetch, verifyAuthorization, webauthn: fakeWebAuthn(), ...extra });
  return out;
};
const listNotes = async (db, headers, now) => {
  const out = output();
  await handleNotes({ method: 'GET', headers }, out, { env, fetchImpl: db.fetch, verifyAuthorization });
  return out;
};

test('승인 전에는 메모 목록이 403이고 자료 조회를 하지 않는다', async () => {
  const db = fakeDb();
  const out = await listNotes(db, { authorization: 'Bearer token-b' });
  assert.equal(out.statusCode, 403);
  assert.deepEqual(out.body, { error: 'device_not_approved' });
  assert.equal(db.calls.includes('GET notes'), false);
});

test('승인 요청 버튼은 승인 대기로만 등록하고 기기 세션을 주지 않는다', async () => {
  const db = fakeDb();
  const options = await call(handleDeviceRegister, db, { authorization: 'Bearer token-b' }, {});
  assert.equal(options.statusCode, 200);
  const registered = await call(handleDeviceRegister, db, { authorization: 'Bearer token-b' }, { response: { id: 'cred-b' } });
  assert.deepEqual(registered.body, { status: 'pending' });
  assert.equal(db.tables.device_credentials[0].approved, false);
  assert.equal(db.tables.device_challenges.length, 0);
  const verify1 = await call(handleDeviceVerify, db, { authorization: 'Bearer token-b' }, {});
  assert.ok(verify1.body.options);
  const pending = await call(handleDeviceVerify, db, { authorization: 'Bearer token-b' }, { response: { id: 'cred-b' } });
  assert.deepEqual(pending.body, { status: 'pending' });
  assert.equal(db.tables.device_sessions.length, 0);
  assert.equal((await listNotes(db, { authorization: 'Bearer token-b' })).statusCode, 403);
});

test('서버 DB에서 승인한 기기만 세션을 받고, 그 세션으로 기존 자료실이 열린다', async () => {
  const db = fakeDb();
  await call(handleDeviceRegister, db, { authorization: 'Bearer token-b' }, {});
  await call(handleDeviceRegister, db, { authorization: 'Bearer token-b' }, { response: { id: 'cred-b' } });
  db.tables.device_credentials[0].approved = true;
  await call(handleDeviceVerify, db, { authorization: 'Bearer token-b' }, {});
  const approved = await call(handleDeviceVerify, db, { authorization: 'Bearer token-b' }, { response: { id: 'cred-b' } });
  assert.equal(approved.body.status, 'approved');
  const token = approved.body.deviceSession;
  assert.match(token, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(db.tables.device_sessions[0].token_sha256, sha256(token));
  assert.equal(JSON.stringify(db.tables.device_sessions).includes(token), false);
  const list = await listNotes(db, { authorization: 'Bearer token-b', 'x-device-session': token });
  assert.equal(list.statusCode, 200);
  assert.equal(list.body.notes.length, 1);
  const other = await listNotes(db, { authorization: 'Bearer token-a', 'x-device-session': token });
  assert.equal(other.statusCode, 403);
  db.tables.device_credentials[0].approved = false;
  assert.equal((await listNotes(db, { authorization: 'Bearer token-b', 'x-device-session': token })).statusCode, 403);
});

test('만료된 기기 세션과 서명 검증 실패는 거부된다', async () => {
  const db = fakeDb();
  db.tables.device_credentials.push({ id: 'cred-b', owner_id: USER_B, public_key: 'AQID', counter: 0, approved: true });
  db.tables.device_sessions.push({ token_sha256: sha256('x'.repeat(43)), owner_id: USER_B, credential_id: 'cred-b',
    expires_at: '2020-01-01T00:00:00Z' });
  assert.equal((await listNotes(db, { authorization: 'Bearer token-b', 'x-device-session': 'x'.repeat(43) })).statusCode, 403);
  await call(handleDeviceVerify, db, { authorization: 'Bearer token-b' }, {}, { webauthn: fakeWebAuthn({ verified: false }) });
  const failed = await call(handleDeviceVerify, db, { authorization: 'Bearer token-b' }, { response: { id: 'cred-b' } },
    { webauthn: fakeWebAuthn({ verified: false }) });
  assert.equal(failed.statusCode, 403);
  assert.equal(db.tables.device_sessions.length, 1);
});

test('기기 승인 흐름은 학생 로그인만 쓰고, 무로그인은 401이다', async () => {
  const db = fakeDb();
  assert.equal((await call(handleDeviceRegister, db, { authorization: 'Bearer judge-a' }, {})).statusCode, 403);
  assert.equal((await call(handleDeviceVerify, db, {}, {})).statusCode, 401);
  assert.equal((await call(handleDeviceRegister, db, { authorization: 'Bearer token-b' }, { response: 'x', extra: 1 })).statusCode, 400);
});
