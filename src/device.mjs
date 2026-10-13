import { createHash, randomBytes } from 'node:crypto';
import config from '../aleph.config.json' with { type: 'json' };

// 11단계: 기기 승인 상태와 기기 세션을 서버(학습 DB)에서만 확인합니다.
// 기기 개인키는 기기의 패스키 인증기 안에만 있고, 서버에는 공개키와 승인 여부만 둡니다.
// 기기 세션 원문은 응답으로 한 번만 돌려주고 DB에는 SHA-256 지문만 저장합니다.
export const DEVICE_SESSION_HEADER = 'x-device-session';
export const DEVICE_SESSION_SECONDS = 30 * 60;
export const CHALLENGE_SECONDS = 5 * 60;
const SESSION_TOKEN = /^[A-Za-z0-9_-]{43}$/u;

const appUrl = new URL(config.publicAppUrl);
export const RP_ID = appUrl.hostname;
export const EXPECTED_ORIGIN = appUrl.origin;
export const RP_NAME = '최부장 비밀 자료실';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const table = (supabaseUrl, name) => new URL(`/rest/v1/${name}`, supabaseUrl);
export const serviceHeaders = (secretKey, extra = {}) => ({ Accept: 'application/json', apikey: secretKey, ...extra });

export function newDeviceSession() {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenSha256: sha256(token) };
}

export function deviceSessionHeader(request) {
  const value = typeof request.headers?.get === 'function'
    ? request.headers.get(DEVICE_SESSION_HEADER) : request.headers?.[DEVICE_SESSION_HEADER];
  return typeof value === 'string' ? value : '';
}

async function readRows(fetchImpl, endpoint, secretKey) {
  const upstream = await fetchImpl(endpoint, { method: 'GET', headers: serviceHeaders(secretKey), redirect: 'error' });
  if (!upstream.ok) throw new Error('upstream_failed');
  const data = await upstream.json();
  if (!Array.isArray(data)) throw new Error('upstream_failed');
  return data;
}

// 기기 세션이 이 사용자 것이고 만료 전이며, 그 세션의 기기가 지금도 승인 상태일 때만 true입니다.
// 승인을 거두면(approved=false) 다음 요청부터 바로 거부됩니다.
export async function checkDeviceSession({ supabaseUrl, secretKey, fetchImpl, owner, token, now = Date.now() }) {
  if (!SESSION_TOKEN.test(token ?? '')) return false;
  const sessionUrl = table(supabaseUrl, 'device_sessions');
  sessionUrl.searchParams.set('select', 'owner_id,credential_id,expires_at');
  sessionUrl.searchParams.set('token_sha256', `eq.${sha256(token)}`);
  sessionUrl.searchParams.set('owner_id', `eq.${owner}`);
  const sessions = await readRows(fetchImpl, sessionUrl, secretKey);
  if (sessions.length !== 1 || sessions[0].owner_id !== owner) return false;
  const expires = Date.parse(sessions[0].expires_at);
  if (!Number.isFinite(expires) || expires <= now) return false;
  const credentialUrl = table(supabaseUrl, 'device_credentials');
  credentialUrl.searchParams.set('select', 'id,owner_id,approved');
  credentialUrl.searchParams.set('id', `eq.${sessions[0].credential_id}`);
  credentialUrl.searchParams.set('owner_id', `eq.${owner}`);
  const credentials = await readRows(fetchImpl, credentialUrl, secretKey);
  return credentials.length === 1 && credentials[0].approved === true;
}
