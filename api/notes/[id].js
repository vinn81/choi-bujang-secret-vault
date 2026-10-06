import {
  authorizeNotesRequest,
  noteFields,
  notesEndpoint,
  requestBody,
  sendJson,
  supabaseHeaders,
  validNoteId,
} from '../notes.js';

function noteId(request) {
  const queryId = request.query?.id;
  if (typeof queryId === 'string') return queryId;
  try {
    const pathname = new URL(request.url, 'https://local.invalid').pathname;
    return decodeURIComponent(pathname.split('/').filter(Boolean).at(-1) ?? '');
  } catch {
    return '';
  }
}

function validRows(data) {
  return Array.isArray(data) && data.every(note => validNoteId(note?.id)
    && typeof note.title === 'string' && typeof note.content === 'string');
}

async function getNote(endpoint, auth, response, fetchImpl) {
  endpoint.searchParams.set('select', 'id,title,content');
  const upstream = await fetchImpl(endpoint, {
    method: 'GET',
    headers: supabaseHeaders(auth.supabaseSecretKey),
    redirect: 'error',
  });
  if (!upstream.ok) return sendJson(response, 500, { error: 'notes_unavailable' });
  const data = await upstream.json();
  if (!validRows(data)) return sendJson(response, 500, { error: 'notes_unavailable' });
  if (data.length === 0) return sendJson(response, 404, { error: 'note_not_found' });
  if (data.length !== 1) return sendJson(response, 500, { error: 'notes_unavailable' });
  const [{ id, title, content }] = data;
  return sendJson(response, 200, { id, title, body: content });
}

async function updateNote(request, endpoint, auth, response, fetchImpl) {
  let value;
  try {
    value = await requestBody(request);
  } catch {
    return sendJson(response, 400, { error: 'invalid_note' });
  }
  const fields = noteFields(value);
  if (!fields) return sendJson(response, 400, { error: 'invalid_note' });
  endpoint.searchParams.set('select', 'id,title,content');
  const upstream = await fetchImpl(endpoint, {
    method: 'PATCH',
    headers: supabaseHeaders(auth.supabaseSecretKey, {
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    }),
    body: JSON.stringify({ title: fields.title, content: fields.body }),
    redirect: 'error',
  });
  if (!upstream.ok) return sendJson(response, 500, { error: 'notes_unavailable' });
  const data = await upstream.json();
  if (!validRows(data)) return sendJson(response, 500, { error: 'notes_unavailable' });
  if (data.length === 0) return sendJson(response, 404, { error: 'note_not_found' });
  if (data.length !== 1) return sendJson(response, 500, { error: 'notes_unavailable' });
  const [{ id, title, content }] = data;
  return sendJson(response, 200, { id, title, body: content });
}

async function deleteNote(endpoint, auth, response, fetchImpl) {
  endpoint.searchParams.set('select', 'id');
  const upstream = await fetchImpl(endpoint, {
    method: 'DELETE',
    headers: supabaseHeaders(auth.supabaseSecretKey, { Prefer: 'return=representation' }),
    redirect: 'error',
  });
  if (!upstream.ok) return sendJson(response, 500, { error: 'notes_unavailable' });
  const data = await upstream.json();
  if (!Array.isArray(data) || data.some(note => !validNoteId(note?.id))) {
    return sendJson(response, 500, { error: 'notes_unavailable' });
  }
  if (data.length === 0) return sendJson(response, 404, { error: 'note_not_found' });
  if (data.length !== 1) return sendJson(response, 500, { error: 'notes_unavailable' });
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  return response.status(204).end();
}

export async function handleNoteById(request, response, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  verifyAuthorization,
} = {}) {
  if (!['GET', 'PUT', 'DELETE'].includes(request.method)) {
    response.setHeader('Allow', 'GET, PUT, DELETE');
    return sendJson(response, 405, { error: 'method_not_allowed' });
  }
  const auth = await authorizeNotesRequest(request, response, { env, verifyAuthorization });
  if (!auth) return undefined;
  const id = noteId(request);
  if (!validNoteId(id)) return sendJson(response, 400, { error: 'invalid_note_id' });
  const endpoint = notesEndpoint(auth.supabaseUrl);
  endpoint.searchParams.set('id', `eq.${id}`);
  try {
    if (request.method === 'PUT') return await updateNote(request, endpoint, auth, response, fetchImpl);
    if (request.method === 'DELETE') return await deleteNote(endpoint, auth, response, fetchImpl);
    return await getNote(endpoint, auth, response, fetchImpl);
  } catch {
    return sendJson(response, 500, { error: 'notes_unavailable' });
  }
}

export default function handler(request, response) {
  return handleNoteById(request, response);
}
