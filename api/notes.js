import { randomUUID } from 'node:crypto';
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from '../src/verify-login.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
let loginVerifier;

export function sendJson(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  return response.status(status).json(body);
}

function getLoginVerifier(supabaseSecretKey) {
  loginVerifier ??= createLoginVerifier({ config, supabaseSecretKey });
  return loginVerifier;
}

function authorizationHeader(request) {
  if (typeof request.headers?.get === 'function') {
    return request.headers.get('authorization');
  }
  return request.headers?.authorization;
}

export async function authorizeNotesRequest(request, response, {
  env = process.env,
  verifyAuthorization,
} = {}) {
  const supabaseUrl = env.SUPABASE_URL?.trim();
  const supabaseSecretKey = env.SUPABASE_SECRET_KEY?.trim();
  if (!supabaseUrl || !supabaseSecretKey) {
    sendJson(response, 500, { error: 'server_not_configured' });
    return null;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(supabaseUrl);
    const issuerOrigin = new URL(config.identityProvider.issuer).origin;
    if (parsedUrl.protocol !== 'https:' || parsedUrl.origin !== issuerOrigin) {
      throw new TypeError('invalid_supabase_url');
    }
  } catch {
    sendJson(response, 500, { error: 'server_not_configured' });
    return null;
  }

  try {
    const verifyLogin = verifyAuthorization ?? getLoginVerifier(supabaseSecretKey);
    const login = await verifyLogin(authorizationHeader(request));
    if (!login) {
      response.setHeader('WWW-Authenticate', 'Bearer');
      sendJson(response, 401, { error: 'authentication_required' });
      return null;
    }
    return { login, supabaseUrl: parsedUrl, supabaseSecretKey };
  } catch {
    sendJson(response, 500, { error: 'server_not_configured' });
    return null;
  }
}

export function notesEndpoint(supabaseUrl) {
  return new URL('/rest/v1/notes', supabaseUrl);
}

export function supabaseHeaders(supabaseSecretKey, extra = {}) {
  return {
    Accept: 'application/json',
    apikey: supabaseSecretKey,
    ...extra,
  };
}

export async function requestBody(request) {
  let value = request.body;
  if (value === undefined && typeof request.json === 'function') {
    value = await request.json();
  }
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value === 'string') value = JSON.parse(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

export function noteFields(value) {
  if (!value || typeof value.title !== 'string' || typeof value.body !== 'string') return null;
  const title = value.title.trim();
  const body = value.body.trim();
  if (!title || title.length > 160 || !body || body.length > 10000) return null;
  return { title, body };
}

export function validNoteId(value) {
  return typeof value === 'string' && value === value.trim() && UUID.test(value);
}

function validRows(data) {
  return Array.isArray(data) && data.every(note => validNoteId(note?.id)
    && typeof note.title === 'string' && typeof note.content === 'string');
}

async function listNotes({ login, supabaseUrl, supabaseSecretKey }, response, fetchImpl) {
  const endpoint = notesEndpoint(supabaseUrl);
  endpoint.searchParams.set('select', 'id,title,content,created_at');
  endpoint.searchParams.set('owner_id', `eq.${login.userId}`);
  endpoint.searchParams.set('order', 'created_at.asc,title.asc');
  endpoint.searchParams.set('limit', '200');
  const upstream = await fetchImpl(endpoint, {
    method: 'GET',
    headers: supabaseHeaders(supabaseSecretKey),
    redirect: 'error',
  });
  if (!upstream.ok) return sendJson(response, 500, { error: 'notes_unavailable' });
  const data = await upstream.json();
  if (!validRows(data)) return sendJson(response, 500, { error: 'notes_unavailable' });
  return sendJson(response, 200, {
    notes: data.map(({ id, title, content }) => ({ id, title, body: content })),
  });
}

async function createNote(request, auth, response, fetchImpl) {
  let value;
  try {
    value = await requestBody(request);
  } catch {
    return sendJson(response, 400, { error: 'invalid_note' });
  }
  const fields = noteFields(value);
  if (!fields) return sendJson(response, 400, { error: 'invalid_note' });
  const hasId = Object.hasOwn(value, 'id');
  if (hasId && !validNoteId(value.id)) {
    return sendJson(response, 400, { error: 'invalid_note_id' });
  }
  const id = hasId ? value.id : randomUUID();
  const endpoint = notesEndpoint(auth.supabaseUrl);
  endpoint.searchParams.set('select', 'id');
  const upstream = await fetchImpl(endpoint, {
    method: 'POST',
    headers: supabaseHeaders(auth.supabaseSecretKey, {
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    }),
    body: JSON.stringify({
      id,
      owner_id: auth.login.userId,
      title: fields.title,
      content: fields.body,
    }),
    redirect: 'error',
  });
  if (upstream.status === 409) return sendJson(response, 409, { error: 'note_conflict' });
  if (!upstream.ok) return sendJson(response, 500, { error: 'notes_unavailable' });
  const data = await upstream.json();
  if (!Array.isArray(data) || data.length !== 1 || data[0]?.id !== id) {
    return sendJson(response, 500, { error: 'notes_unavailable' });
  }
  return sendJson(response, 201, { id });
}

export async function handleNotes(request, response, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  verifyAuthorization,
} = {}) {
  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST');
    return sendJson(response, 405, { error: 'method_not_allowed' });
  }
  const auth = await authorizeNotesRequest(request, response, { env, verifyAuthorization });
  if (!auth) return undefined;
  try {
    if (request.method === 'POST') return await createNote(request, auth, response, fetchImpl);
    return await listNotes(auth, response, fetchImpl);
  } catch {
    return sendJson(response, 500, { error: 'notes_unavailable' });
  }
}

export default function handler(request, response) {
  return handleNotes(request, response);
}
