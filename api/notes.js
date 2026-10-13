import { createHash, randomUUID } from 'node:crypto';
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from '../src/verify-login.mjs';
import { resourceIdForApi } from '../src/resources.mjs';
import { checkDeviceSession, deviceSessionHeader } from '../src/device.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const PUBLISHABLE_KEY = /^sb_publishable_[A-Za-z0-9_-]{20,}$/u;
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

function authConfigRequested(request) {
  const value = request.query?.auth;
  return request.method === 'GET' && typeof value === 'string' && value === 'config';
}

function sendAuthConfig(response, env) {
  const supabaseUrl = env.SUPABASE_URL?.trim();
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY?.trim();
  try {
    const parsedUrl = new URL(supabaseUrl);
    const issuerOrigin = new URL(config.identityProvider.issuer).origin;
    if (parsedUrl.protocol !== 'https:' || parsedUrl.origin !== issuerOrigin
        || !PUBLISHABLE_KEY.test(publishableKey || '')) {
      throw new TypeError('invalid_auth_config');
    }
    return sendJson(response, 200, {
      supabaseUrl: parsedUrl.origin,
      publishableKey,
    });
  } catch {
    return sendJson(response, 500, { error: 'server_not_configured' });
  }
}

// 8단계: 심판 로그인은 같은 sub 아래 a/b 두 신원을 쓸 수 있으므로, 검증된 sub·실행 번호·신원을
// 묶어 신원마다 다른 소유자 키(UUID 모양)를 만듭니다. 학생 로그인의 소유자 키는 sub 그대로입니다.
export function ownerLogin(login) {
  if (login?.kind !== 'judge') return login;
  const hex = createHash('sha256')
    .update(`judge-owner\0${login.userId}\0${login.runId}\0${login.identity}`).digest('hex');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const userId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  return Object.freeze({ ...login, userId });
}

// 11단계: 학생 로그인은 서버가 승인한 기기의 세션(x-device-session)이 있어야 자료를 엽니다.
// requireDevice:false는 기기 승인 요청·확인 경로에서만 씁니다. 심판 로그인은 기기 세션 없이 검사합니다.
export async function authorizeNotesRequest(request, response, {
  env = process.env,
  verifyAuthorization,
  fetchImpl = globalThis.fetch,
  verifyDeviceSession,
  requireDevice = true,
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
    const owned = ownerLogin(login);
    if (requireDevice && owned.kind === 'student') {
      const token = deviceSessionHeader(request);
      const approved = verifyDeviceSession
        ? await verifyDeviceSession(owned.userId, token)
        : await checkDeviceSession({ supabaseUrl: parsedUrl, secretKey: supabaseSecretKey, fetchImpl,
          owner: owned.userId, token });
      if (!approved) {
        sendJson(response, 403, { error: 'device_not_approved' });
        return null;
      }
    }
    return { login: owned, supabaseUrl: parsedUrl, supabaseSecretKey };
  } catch {
    sendJson(response, 500, { error: 'server_not_configured' });
    return null;
  }
}

// 8단계: 요청마다 서버가 자원 구역 표에서 찾은 자원 ID를 응답 헤더에 표시합니다.
export function markResource(response, method, apiRoute) {
  const resourceId = resourceIdForApi(method, apiRoute);
  if (resourceId) response.setHeader('X-Resource-Id', resourceId);
  return resourceId;
}

// 8단계: 판정기를 통과해도 자료 API가 검증된 로그인과 자원 구역을 다시 대조합니다.
// 화면 메뉴나 요청 본문·쿼리의 role·owner_id는 읽지 않습니다. 소유자는 아래 owner_id 조건과 응답 행 검사로 확인합니다.
// 강사 권한을 저장한 자료가 없으므로 강사 공지 같은 다른 구역은 모두 거부합니다.
const ZONE_LOGIN_KINDS = Object.freeze({ 'notes.own': new Set(['student', 'judge']) });

export function denyOutsideZone(response, login, resourceId) {
  if (ZONE_LOGIN_KINDS[resourceId]?.has(login?.kind) && UUID.test(login.userId ?? '')) return false;
  const error = resourceId === 'notices.instructor' ? 'instructor_role_required' : 'resource_zone_denied';
  sendJson(response, 403, { error });
  return true;
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

function validRows(data, expectedOwnerId) {
  return Array.isArray(data) && data.every(note => validNoteId(note?.id)
    && typeof note.title === 'string' && typeof note.content === 'string'
    && note.owner_id === expectedOwnerId);
}

async function listNotes({ login, supabaseUrl, supabaseSecretKey }, response, fetchImpl) {
  const endpoint = notesEndpoint(supabaseUrl);
  endpoint.searchParams.set('select', 'id,owner_id,title,content,created_at');
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
  if (!validRows(data, login.userId)) {
    return sendJson(response, 500, { error: 'notes_unavailable' });
  }
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
  endpoint.searchParams.set('select', 'id,owner_id');
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
  if (!Array.isArray(data) || data.length !== 1 || data[0]?.id !== id
      || data[0]?.owner_id !== auth.login.userId) {
    return sendJson(response, 500, { error: 'notes_unavailable' });
  }
  return sendJson(response, 201, { id });
}

export async function handleNotes(request, response, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  verifyAuthorization,
  verifyDeviceSession,
} = {}) {
  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST');
    return sendJson(response, 405, { error: 'method_not_allowed' });
  }
  if (authConfigRequested(request)) return sendAuthConfig(response, env);
  const resourceId = markResource(response, request.method, '/api/notes');
  const auth = await authorizeNotesRequest(request, response, { env, verifyAuthorization, fetchImpl, verifyDeviceSession });
  if (!auth) return undefined;
  if (denyOutsideZone(response, auth.login, resourceId)) return undefined;
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
