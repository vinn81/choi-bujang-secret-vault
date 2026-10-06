import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleNotes } from '../api/notes.js';
import { handleNoteById } from '../api/notes/[id].js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const PROJECT_URL = 'https://yhjbdzvzdncohckdocao.supabase.co';
const env = { SUPABASE_URL: PROJECT_URL, SUPABASE_SECRET_KEY: 'test-server-key' };

function response() {
  return {
    headers: new Map(),
    statusCode: null,
    body: null,
    setHeader(name, value) { this.headers.set(name.toLowerCase(), value); },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

function verifier(authorization) {
  return authorization === 'Bearer token-a' ? { kind: 'student', userId: USER_A } : null;
}

function dataApi() {
  const rows = new Map();
  let calls = 0;
  return {
    rows,
    get calls() { return calls; },
    async fetch(url, init) {
      calls += 1;
      const endpoint = new URL(url);
      const idFilter = endpoint.searchParams.get('id');
      const ownerFilter = endpoint.searchParams.get('owner_id');
      let selected = [...rows.values()];
      if (idFilter?.startsWith('eq.')) selected = selected.filter(row => row.id === idFilter.slice(3));
      if (ownerFilter?.startsWith('eq.')) {
        selected = selected.filter(row => row.owner_id === ownerFilter.slice(3));
      }

      if (init.method === 'POST') {
        const row = { ...JSON.parse(init.body), created_at: new Date(0).toISOString() };
        if (rows.has(row.id)) return Response.json({ error: 'conflict' }, { status: 409 });
        rows.set(row.id, row);
        return Response.json([{ id: row.id }], { status: 201 });
      }
      if (init.method === 'PATCH') {
        const patch = JSON.parse(init.body);
        for (const row of selected) Object.assign(row, patch);
        return Response.json(selected.map(row => ({
          id: row.id, title: row.title, content: row.content,
        })));
      }
      if (init.method === 'DELETE') {
        for (const row of selected) rows.delete(row.id);
        return Response.json(selected.map(row => ({ id: row.id })));
      }
      return Response.json(selected.map(row => ({
        id: row.id,
        title: row.title,
        content: row.content,
        created_at: row.created_at,
      })));
    },
  };
}

test('무로그인 목록·추가·조회·수정·삭제는 자료 조회 전에 401로 거부한다', async () => {
  const api = dataApi();
  const cases = [
    [handleNotes, { method: 'GET', headers: {} }],
    [handleNotes, { method: 'POST', headers: {}, body: { title: '제목', body: '내용' } }],
    [handleNoteById, { method: 'GET', headers: {}, query: { id: USER_A } }],
    [handleNoteById, { method: 'PUT', headers: {}, query: { id: USER_A }, body: { title: '제목', body: '내용' } }],
    [handleNoteById, { method: 'DELETE', headers: {}, query: { id: USER_A } }],
  ];
  for (const [handler, request] of cases) {
    const output = response();
    await handler(request, output, { env, fetchImpl: api.fetch, verifyAuthorization: verifier });
    assert.equal(output.statusCode, 401);
    assert.deepEqual(output.body, { error: 'authentication_required' });
  }
  assert.equal(api.calls, 0);
});

test('A는 자신의 가상 메모를 추가·목록 조회·수정·삭제하고 삭제 뒤 404를 받는다', async () => {
  const api = dataApi();
  const headers = { authorization: 'Bearer token-a' };
  const createResponse = response();
  await handleNotes({
    method: 'POST',
    headers,
    body: { title: '가상 제목', body: '가상 내용', owner_id: '브라우저 위조값' },
  }, createResponse, { env, fetchImpl: api.fetch, verifyAuthorization: verifier });
  assert.equal(createResponse.statusCode, 201);
  assert.match(createResponse.body.id, /^[0-9a-f-]{36}$/u);
  assert.equal(api.rows.get(createResponse.body.id).owner_id, USER_A);
  api.rows.set('22222222-2222-4222-8222-222222222222', {
    id: '22222222-2222-4222-8222-222222222222',
    owner_id: '33333333-3333-4333-8333-333333333333',
    title: '다른 소유자',
    content: '목록 제외 확인',
    created_at: new Date(0).toISOString(),
  });

  const listResponse = response();
  await handleNotes({ method: 'GET', headers }, listResponse,
    { env, fetchImpl: api.fetch, verifyAuthorization: verifier });
  assert.equal(listResponse.statusCode, 200);
  assert.deepEqual(listResponse.body, {
    notes: [{ id: createResponse.body.id, title: '가상 제목', body: '가상 내용' }],
  });

  const updateResponse = response();
  await handleNoteById({
    method: 'PUT', headers, query: { id: createResponse.body.id },
    body: { title: '수정 제목', body: '수정 내용' },
  }, updateResponse, { env, fetchImpl: api.fetch, verifyAuthorization: verifier });
  assert.equal(updateResponse.statusCode, 200);
  assert.deepEqual(updateResponse.body,
    { id: createResponse.body.id, title: '수정 제목', body: '수정 내용' });

  const getResponse = response();
  await handleNoteById({ method: 'GET', headers, query: { id: createResponse.body.id } },
    getResponse, { env, fetchImpl: api.fetch, verifyAuthorization: verifier });
  assert.equal(getResponse.statusCode, 200);
  assert.deepEqual(getResponse.body,
    { id: createResponse.body.id, title: '수정 제목', body: '수정 내용' });

  const deleteResponse = response();
  await handleNoteById({ method: 'DELETE', headers, query: { id: createResponse.body.id } },
    deleteResponse, { env, fetchImpl: api.fetch, verifyAuthorization: verifier });
  assert.equal(deleteResponse.statusCode, 204);

  const missingResponse = response();
  await handleNoteById({ method: 'GET', headers, query: { id: createResponse.body.id } },
    missingResponse, { env, fetchImpl: api.fetch, verifyAuthorization: verifier });
  assert.equal(missingResponse.statusCode, 404);
  assert.deepEqual(missingResponse.body, { error: 'note_not_found' });
});

test('POST는 제공된 UUID를 사용하고 같은 ID의 중복 추가를 409로 거부한다', async () => {
  const api = dataApi();
  const headers = { authorization: 'Bearer token-a' };
  const id = '44444444-4444-4444-8444-444444444444';
  const request = { method: 'POST', headers, body: { id, title: '지정 ID', body: '가상 내용' } };
  const created = response();
  await handleNotes(request, created, { env, fetchImpl: api.fetch, verifyAuthorization: verifier });
  assert.equal(created.statusCode, 201);
  assert.deepEqual(created.body, { id });
  assert.equal(api.rows.get(id).owner_id, USER_A);

  const conflict = response();
  await handleNotes(request, conflict, { env, fetchImpl: api.fetch, verifyAuthorization: verifier });
  assert.equal(conflict.statusCode, 409);
  assert.deepEqual(conflict.body, { error: 'note_conflict' });
});
