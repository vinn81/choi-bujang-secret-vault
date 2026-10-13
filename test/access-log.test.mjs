import assert from 'node:assert/strict';
import test from 'node:test';
import { handleNotes } from '../api/notes.js';
import { handleData } from '../api/data.js';
import { withAccessLog } from '../src/access-log.mjs';

// 12단계 서버 요청 기록을 가상 DB로 시험합니다. 요청마다 한 줄이 남고, 기록 실패가 응답을 막지 않는지 봅니다.
const USER_A = '11111111-1111-4111-8111-111111111111';
const env = { SUPABASE_URL: 'https://yhjbdzvzdncohckdocao.supabase.co', SUPABASE_SECRET_KEY: 'test-only-placeholder' };
const REQUEST_ID = '5a1a20eb-d4d3-4e1a-898e-22d4a9b79520';

function output() {
  return { headers: new Map(), statusCode: 200, body: undefined, sent: false,
    setHeader(name, value) { this.headers.set(name.toLowerCase(), value); },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.sent = true; return this; }, end() { this.sent = true; return this; } };
}

function logDb({ fail = false } = {}) {
  const rows = [];
  return { rows, async fetch(url, init) {
    assert.equal(new URL(url).pathname, '/rest/v1/access_log');
    assert.equal(init.method, 'POST');
    if (fail) throw new Error('db_down');
    rows.push(JSON.parse(init.body));
    return new Response(null, { status: 201 });
  } };
}

test('비로그인 요청도 요청 ID·점검 이름·경로·상태가 기록되고 응답 머리에 요청 ID가 붙는다', async () => {
  const db = logDb();
  const handler = withAccessLog('/api/notes', (request, response) => handleNotes(request, response,
    { env, verifyAuthorization: async () => null }), { env, fetchImpl: db.fetch });
  const out = output();
  await handler({ method: 'GET', headers: { 'x-request-id': REQUEST_ID, 'x-aleph-attack-id': 'anonymous_notes_list' }, query: {} }, out);
  assert.equal(out.statusCode, 401);
  assert.equal(out.sent, true);
  assert.equal(out.headers.get('x-request-id'), REQUEST_ID);
  assert.deepEqual(db.rows, [{ request_id: REQUEST_ID, attack_id: 'anonymous_notes_list', method: 'GET',
    route: '/api/notes', status: 401, owner_id: null }]);
});

test('로그인한 요청은 검증된 소유자 키만 남기고, 메모 본문·토큰은 기록하지 않는다', async () => {
  const db = logDb();
  const notesApi = async () => Response.json([{ id: 'e1a96dca-6a1d-4a52-bee4-d8f63f0f8e5f', owner_id: USER_A,
    title: '비밀 제목', content: '비밀 본문' }]);
  const handler = withAccessLog('/api/notes', (request, response) => handleNotes(request, response, {
    env, verifyAuthorization: async () => ({ kind: 'student', userId: USER_A }), verifyDeviceSession: async () => true,
    fetchImpl: notesApi,
  }), { env, fetchImpl: db.fetch });
  const out = output();
  await handler({ method: 'GET', headers: { authorization: 'Bearer secret-token' }, query: {} }, out);
  assert.equal(out.statusCode, 200);
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].owner_id, USER_A);
  assert.match(db.rows[0].request_id, /^[0-9a-f-]{36}$/u);
  const text = JSON.stringify(db.rows);
  for (const hidden of ['비밀', 'secret-token']) assert.equal(text.includes(hidden), false, hidden);
});

test('형식이 틀린 요청 ID·점검 이름은 버리고 서버가 새 요청 ID를 만든다', async () => {
  const db = logDb();
  const handler = withAccessLog('/data.json', handleData, { env, fetchImpl: db.fetch });
  const out = output();
  await handler({ method: 'GET', headers: { 'x-request-id': 'not-a-uuid', 'x-aleph-attack-id': '../bad id' } }, out);
  assert.deepEqual(out.body, { notes: [] });
  assert.notEqual(db.rows[0].request_id, 'not-a-uuid');
  assert.equal(db.rows[0].attack_id, null);
  assert.equal(out.headers.get('x-request-id'), db.rows[0].request_id);
});

test('기록 저장이 실패해도 원래 응답은 그대로 나간다', async () => {
  const handler = withAccessLog('/data.json', handleData, { env, fetchImpl: logDb({ fail: true }).fetch });
  const out = output();
  await handler({ method: 'GET', headers: {} }, out);
  assert.equal(out.sent, true);
  assert.equal(out.statusCode, 200);
  assert.deepEqual(out.body, { notes: [] });
});
