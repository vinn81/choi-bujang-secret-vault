import assert from 'node:assert/strict';
import test from 'node:test';
import { handleRestore, noteContentHash } from '../api/restore.js';

// 10단계 복원 경로를 가상 자료로 시험합니다. 실제 학습 DB에는 접속하지 않습니다.
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const NOTE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOTE_B2 = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002';
const NOTE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const env = { SUPABASE_URL: 'https://yhjbdzvzdncohckdocao.supabase.co', SUPABASE_SECRET_KEY: 'test-only-placeholder' };
const verifyAuthorization = async header => ({
  'Bearer token-a': { kind: 'student', userId: USER_A },
  'Bearer token-b': { kind: 'student', userId: USER_B },
})[header] ?? null;

function fakeSupabase() {
  const tables = {
    notes: new Map([
      [NOTE_B, { id: NOTE_B, owner_id: USER_B, title: '침공으로 바뀐 제목', content: '침공으로 바뀐 내용' }],
      [NOTE_B2, { id: NOTE_B2, owner_id: USER_B, title: 'B 다른 메모', content: '그대로 둘 내용' }],
      [NOTE_A, { id: NOTE_A, owner_id: USER_A, title: 'A 메모', content: 'A 내용' }],
    ]),
    notes_backup: new Map([
      [NOTE_B, { id: NOTE_B, owner_id: USER_B, title: 'B 원래 제목', content: 'B 원래 가상 내용',
        content_sha256: noteContentHash('B 원래 제목', 'B 원래 가상 내용') }],
      [NOTE_A, { id: NOTE_A, owner_id: USER_A, title: 'A 메모', content: 'A 내용',
        content_sha256: noteContentHash('A 메모', 'A 내용') }],
    ]),
    notes_restore_audit: [],
  };
  return {
    tables,
    async fetch(url, init) {
      const endpoint = new URL(url);
      const name = endpoint.pathname.split('/').at(-1);
      const filter = key => endpoint.searchParams.get(key)?.replace(/^eq\./u, '');
      if (name === 'notes_restore_audit') {
        tables.notes_restore_audit.push(JSON.parse(init.body));
        return new Response(null, { status: 201 });
      }
      const rows = tables[name];
      let selected = [...rows.values()];
      if (filter('id')) selected = selected.filter(row => row.id === filter('id'));
      if (filter('owner_id')) selected = selected.filter(row => row.owner_id === filter('owner_id'));
      if (init.method === 'POST') {
        const row = JSON.parse(init.body);
        rows.set(row.id, row);
        return new Response(null, { status: 201 });
      }
      if (init.method === 'PATCH') {
        for (const row of selected) Object.assign(row, JSON.parse(init.body));
        return new Response(null, { status: 204 });
      }
      return Response.json(selected.map(row => ({ ...row })));
    },
  };
}

function output() {
  return {
    headers: new Map(), statusCode: 200, body: undefined,
    setHeader(name, value) { this.headers.set(name.toLowerCase(), value); },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

const restore = async (db, headers, body, method = 'POST') => {
  const out = output();
  await handleRestore({ method, headers, body }, out, { env, fetchImpl: db.fetch, verifyAuthorization,
    verifyDeviceSession: async () => true });
  return out;
};

test('B는 사본에서 자기 메모 한 건만 복원하고 ID·소유자·내용 해시가 사본과 같다', async () => {
  const db = fakeSupabase();
  const before = { b2: { ...db.tables.notes.get(NOTE_B2) }, a: { ...db.tables.notes.get(NOTE_A) } };
  const out = await restore(db, { authorization: 'Bearer token-b' }, { id: NOTE_B });
  assert.equal(out.statusCode, 200);
  assert.equal(out.headers.get('x-resource-id'), 'notes.own');
  const backup = db.tables.notes_backup.get(NOTE_B);
  const restored = db.tables.notes.get(NOTE_B);
  assert.deepEqual(out.body, { id: NOTE_B, restored: true, contentSha256: backup.content_sha256 });
  assert.equal(restored.id, backup.id);
  assert.equal(restored.owner_id, backup.owner_id);
  assert.equal(noteContentHash(restored.title, restored.content), backup.content_sha256);
  assert.equal(JSON.stringify(out.body).includes('원래 가상 내용'), false);
  assert.deepEqual(db.tables.notes.get(NOTE_B2), before.b2);
  assert.deepEqual(db.tables.notes.get(NOTE_A), before.a);
  assert.equal(db.tables.notes_restore_audit.length, 1);
  assert.deepEqual(Object.keys(db.tables.notes_restore_audit[0]).sort(),
    ['after_sha256', 'before_sha256', 'note_id', 'owner_id', 'result']);
  assert.equal(db.tables.notes_restore_audit[0].result, 'restored');
});

test('지워진 B 메모는 같은 ID로 다시 추가되고 감사 기록은 덧붙기만 한다', async () => {
  const db = fakeSupabase();
  db.tables.notes.delete(NOTE_B);
  db.tables.notes_restore_audit.push({ note_id: NOTE_A, owner_id: USER_A, before_sha256: null, after_sha256: 'earlier' });
  const out = await restore(db, { authorization: 'Bearer token-b' }, { id: NOTE_B });
  assert.equal(out.statusCode, 200);
  assert.equal(db.tables.notes.get(NOTE_B).owner_id, USER_B);
  assert.equal(db.tables.notes_restore_audit.length, 2);
  assert.equal(db.tables.notes_restore_audit[0].after_sha256, 'earlier');
});

test('B는 A 메모를 복원할 수 없고, 거부된 시도도 감사 기록에 남는다', async () => {
  const db = fakeSupabase();
  const before = { ...db.tables.notes.get(NOTE_A) };
  const other = await restore(db, { authorization: 'Bearer token-b' }, { id: NOTE_A });
  assert.equal(other.statusCode, 404);
  assert.deepEqual(db.tables.notes.get(NOTE_A), before);
  assert.deepEqual(db.tables.notes_restore_audit, [{ note_id: NOTE_A, owner_id: USER_B,
    result: 'backup_not_found', before_sha256: null, after_sha256: null }]);
  const extra = await restore(db, { authorization: 'Bearer token-b' }, { id: NOTE_A, owner_id: USER_B });
  assert.equal(extra.statusCode, 400);
  assert.equal(db.tables.notes_restore_audit.length, 1);
});

test('사본 해시가 맞지 않거나 로그인이 없거나 POST가 아니면 복원하지 않고, 해시 불일치만 감사 기록에 남는다', async () => {
  const db = fakeSupabase();
  db.tables.notes_backup.get(NOTE_B).content_sha256 = '0'.repeat(64);
  const tampered = await restore(db, { authorization: 'Bearer token-b' }, { id: NOTE_B });
  assert.equal(tampered.statusCode, 409);
  assert.equal(db.tables.notes.get(NOTE_B).title, '침공으로 바뀐 제목');
  assert.equal((await restore(db, {}, { id: NOTE_B })).statusCode, 401);
  assert.equal((await restore(db, { authorization: 'Bearer token-b' }, { id: NOTE_B }, 'GET')).statusCode, 405);
  assert.deepEqual(db.tables.notes_restore_audit.map(row => row.result), ['backup_verification_failed']);
});

test('감사 기록을 쓰지 못하면 성공 응답을 주지 않는다', async () => {
  const db = fakeSupabase();
  const fetchImpl = async (url, init) => (new URL(url).pathname.endsWith('/notes_restore_audit')
    ? new Response(null, { status: 500 }) : db.fetch(url, init));
  const out = output();
  await handleRestore({ method: 'POST', headers: { authorization: 'Bearer token-b' }, body: { id: NOTE_B } },
    out, { env, fetchImpl, verifyAuthorization, verifyDeviceSession: async () => true });
  assert.equal(out.statusCode, 500);
  assert.deepEqual(out.body, { error: 'restore_audit_failed' });
});

test('이미 사본과 같은 메모는 쓰지 않고 unchanged로 감사 기록에 남긴다', async () => {
  const db = fakeSupabase();
  const out = await restore(db, { authorization: 'Bearer token-a' }, { id: NOTE_A });
  assert.equal(out.statusCode, 200);
  assert.equal(out.body.restored, false);
  assert.equal(db.tables.notes_restore_audit[0].result, 'unchanged');
});
