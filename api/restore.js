import { createHash } from 'node:crypto';
import {
  authorizeNotesRequest,
  denyOutsideZone,
  requestBody,
  sendJson,
  supabaseHeaders,
  validNoteId,
} from './notes.js';

// 10단계: 비공개 가상 메모 사본(notes_backup)에서 로그인한 본인의 메모 한 건만 복원합니다.
// 요청 본문은 { "id": "<메모 UUID>" } 하나만 받습니다. 소유자는 검증된 로그인에서만 정하고 본문 값을 믿지 않습니다.
// 사본의 ID·소유자·내용 해시를 대조한 뒤 그 한 건만 쓰고, 다시 읽어 같은지 확인합니다.
// 다른 메모는 건드리지 않고, 감사 기록(notes_restore_audit)에는 내용 없이 지문만 덧붙입니다.
const RESOURCE_ID = 'notes.own';

// 내용 해시: 제목과 본문을 줄바꿈 하나로 이은 UTF-8 문자열의 SHA-256입니다(policy/restore-backup.sql과 같은 식).
export const noteContentHash = (title, content) => createHash('sha256')
  .update(`${title}\n${content}`, 'utf8').digest('hex');

const table = (supabaseUrl, name) => new URL(`/rest/v1/${name}`, supabaseUrl);
const validRow = row => row && validNoteId(row.id) && typeof row.owner_id === 'string'
  && typeof row.title === 'string' && typeof row.content === 'string';

async function readRows(fetchImpl, endpoint, secretKey) {
  const upstream = await fetchImpl(endpoint, { method: 'GET', headers: supabaseHeaders(secretKey), redirect: 'error' });
  if (!upstream.ok) throw new Error('upstream_failed');
  const data = await upstream.json();
  if (!Array.isArray(data)) throw new Error('upstream_failed');
  return data;
}

export async function handleRestore(request, response, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  verifyAuthorization,
} = {}) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { error: 'method_not_allowed' });
  }
  response.setHeader('X-Resource-Id', RESOURCE_ID);
  const auth = await authorizeNotesRequest(request, response, { env, verifyAuthorization });
  if (!auth) return undefined;
  if (denyOutsideZone(response, auth.login, RESOURCE_ID)) return undefined;

  let value;
  try { value = await requestBody(request); } catch { value = null; }
  if (!value || Object.keys(value).length !== 1 || !validNoteId(value.id)) {
    return sendJson(response, 400, { error: 'invalid_restore_request' });
  }
  const { id } = value;
  const owner = auth.login.userId;
  const { supabaseUrl, supabaseSecretKey: key } = auth;

  try {
    // 1) 사본에서 이 ID·소유자의 한 건만 찾고 내용 해시를 대조합니다.
    const backupUrl = table(supabaseUrl, 'notes_backup');
    backupUrl.searchParams.set('select', 'id,owner_id,title,content,content_sha256');
    backupUrl.searchParams.set('id', `eq.${id}`);
    backupUrl.searchParams.set('owner_id', `eq.${owner}`);
    const backups = await readRows(fetchImpl, backupUrl, key);
    if (backups.length === 0) return sendJson(response, 404, { error: 'backup_not_found' });
    const [backup] = backups;
    if (backups.length !== 1 || !validRow(backup) || backup.id !== id || backup.owner_id !== owner) {
      return sendJson(response, 409, { error: 'backup_verification_failed' });
    }
    const backupHash = noteContentHash(backup.title, backup.content);
    if (backup.content_sha256 !== backupHash) return sendJson(response, 409, { error: 'backup_verification_failed' });

    // 2) 현재 메모를 ID로 찾습니다. 다른 사용자의 같은 ID 메모는 덮어쓰지 않습니다.
    const noteUrl = table(supabaseUrl, 'notes');
    noteUrl.searchParams.set('select', 'id,owner_id,title,content');
    noteUrl.searchParams.set('id', `eq.${id}`);
    const currentRows = await readRows(fetchImpl, noteUrl, key);
    const current = currentRows[0] ?? null;
    if (currentRows.length > 1 || (current && current.owner_id !== owner)) {
      return sendJson(response, 409, { error: 'note_owner_mismatch' });
    }
    const beforeHash = current && validRow(current) ? noteContentHash(current.title, current.content) : null;

    // 3) 그 한 건만 사본 내용으로 씁니다(있으면 수정, 없으면 같은 ID로 추가).
    if (beforeHash !== backupHash) {
      const writeUrl = table(supabaseUrl, 'notes');
      if (current) {
        writeUrl.searchParams.set('id', `eq.${id}`);
        writeUrl.searchParams.set('owner_id', `eq.${owner}`);
      }
      const write = await fetchImpl(writeUrl, {
        method: current ? 'PATCH' : 'POST',
        headers: supabaseHeaders(key, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify(current
          ? { title: backup.title, content: backup.content }
          : { id, owner_id: owner, title: backup.title, content: backup.content }),
        redirect: 'error',
      });
      if (!write.ok) return sendJson(response, 500, { error: 'restore_failed' });
    }

    // 4) 다시 읽어 ID·소유자·내용 해시가 사본과 같은지 확인합니다.
    const checkUrl = table(supabaseUrl, 'notes');
    checkUrl.searchParams.set('select', 'id,owner_id,title,content');
    checkUrl.searchParams.set('id', `eq.${id}`);
    checkUrl.searchParams.set('owner_id', `eq.${owner}`);
    const after = await readRows(fetchImpl, checkUrl, key);
    const afterHash = after.length === 1 && validRow(after[0]) ? noteContentHash(after[0].title, after[0].content) : null;
    if (afterHash !== backupHash || after[0].id !== id || after[0].owner_id !== owner) {
      return sendJson(response, 500, { error: 'restore_verification_failed' });
    }

    // 5) 감사 기록은 덧붙이기만 합니다. 메모 내용·토큰은 넣지 않습니다.
    const audit = await fetchImpl(table(supabaseUrl, 'notes_restore_audit'), {
      method: 'POST',
      headers: supabaseHeaders(key, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({ note_id: id, owner_id: owner, before_sha256: beforeHash, after_sha256: afterHash }),
      redirect: 'error',
    });
    if (!audit.ok) return sendJson(response, 500, { error: 'restore_audit_failed' });

    return sendJson(response, 200, { id, restored: beforeHash !== backupHash, contentSha256: afterHash });
  } catch {
    return sendJson(response, 500, { error: 'restore_unavailable' });
  }
}

export default function handler(request, response) {
  return handleRestore(request, response);
}
