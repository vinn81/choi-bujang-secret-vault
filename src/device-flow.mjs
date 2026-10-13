import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { authorizeNotesRequest, requestBody, sendJson } from '../api/notes.js';
import {
  CHALLENGE_SECONDS, DEVICE_SESSION_SECONDS, EXPECTED_ORIGIN, RP_ID, RP_NAME,
  newDeviceSession, serviceHeaders, table,
} from './device.mjs';

// 11단계 기기 승인 흐름의 서버 처리입니다.
// - 승인 요청(register): 이 기기의 패스키 공개키를 '승인 대기'(approved=false)로만 저장합니다. 버튼을 눌러도 권한은 생기지 않습니다.
// - 승인 확인(verify): 패스키 서명을 검증하고, 서버 DB에서 승인된 기기일 때만 30분 기기 세션을 줍니다.
// 승인 자체는 학생이 Supabase SQL Editor에서 device_credentials.approved를 바꿔서 합니다(policy/device-approval.sql).
export const defaultWebAuthn = {
  generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse,
};

async function rest(fetchImpl, url, key, init = {}) {
  const upstream = await fetchImpl(url, { redirect: 'error', ...init,
    headers: serviceHeaders(key, init.body ? { 'Content-Type': 'application/json', Prefer: 'return=minimal' } : {}) });
  if (!upstream.ok) throw new Error('upstream_failed');
  if (init.method && init.method !== 'GET') return null;
  const data = await upstream.json();
  if (!Array.isArray(data)) throw new Error('upstream_failed');
  return data;
}

async function saveChallenge(ctx, kind, challenge) {
  await rest(ctx.fetchImpl, table(ctx.supabaseUrl, 'device_challenges'), ctx.key, { method: 'POST',
    body: JSON.stringify({ owner_id: ctx.owner, kind, challenge,
      expires_at: new Date(ctx.now() + CHALLENGE_SECONDS * 1000).toISOString() }) });
}

// 가장 최근의 만료 전 챌린지를 꺼내고, 같은 종류의 챌린지는 모두 지워 한 번만 쓰게 합니다.
async function takeChallenge(ctx, kind) {
  const url = table(ctx.supabaseUrl, 'device_challenges');
  url.searchParams.set('select', 'challenge,expires_at');
  url.searchParams.set('owner_id', `eq.${ctx.owner}`);
  url.searchParams.set('kind', `eq.${kind}`);
  url.searchParams.set('order', 'expires_at.desc');
  url.searchParams.set('limit', '1');
  const rows = await rest(ctx.fetchImpl, url, ctx.key);
  const clear = table(ctx.supabaseUrl, 'device_challenges');
  clear.searchParams.set('owner_id', `eq.${ctx.owner}`);
  clear.searchParams.set('kind', `eq.${kind}`);
  await rest(ctx.fetchImpl, clear, ctx.key, { method: 'DELETE' });
  const row = rows[0];
  return row && Date.parse(row.expires_at) > ctx.now() ? row.challenge : null;
}

async function credentialsOf(ctx) {
  const url = table(ctx.supabaseUrl, 'device_credentials');
  url.searchParams.set('select', 'id,owner_id,public_key,counter,approved');
  url.searchParams.set('owner_id', `eq.${ctx.owner}`);
  return rest(ctx.fetchImpl, url, ctx.key);
}

async function startFlow(request, response, options) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    sendJson(response, 405, { error: 'method_not_allowed' });
    return null;
  }
  const { env = process.env, fetchImpl = globalThis.fetch, verifyAuthorization, now = Date.now } = options;
  const auth = await authorizeNotesRequest(request, response, { env, verifyAuthorization, fetchImpl, requireDevice: false });
  if (!auth) return null;
  if (auth.login.kind !== 'student') {
    sendJson(response, 403, { error: 'device_flow_student_only' });
    return null;
  }
  let body;
  try { body = await requestBody(request); } catch { body = null; }
  if (!body || Object.keys(body).some(key => key !== 'response')
      || (body.response !== undefined && (typeof body.response !== 'object' || body.response === null))) {
    sendJson(response, 400, { error: 'invalid_device_request' });
    return null;
  }
  return { body, ctx: { fetchImpl, now, owner: auth.login.userId, supabaseUrl: auth.supabaseUrl,
    key: auth.supabaseSecretKey, webauthn: options.webauthn ?? defaultWebAuthn } };
}

export async function handleDeviceRegister(request, response, options = {}) {
  const started = await startFlow(request, response, options);
  if (!started) return undefined;
  const { body, ctx } = started;
  try {
    if (!body.response) {
      const existing = await credentialsOf(ctx);
      const registration = await ctx.webauthn.generateRegistrationOptions({
        rpName: RP_NAME, rpID: RP_ID, userName: ctx.owner, userDisplayName: '자료실 사용자',
        userID: new TextEncoder().encode(ctx.owner), attestationType: 'none',
        excludeCredentials: existing.map(item => ({ id: item.id })),
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
      });
      await saveChallenge(ctx, 'register', registration.challenge);
      return sendJson(response, 200, { options: registration });
    }
    const expectedChallenge = await takeChallenge(ctx, 'register');
    if (!expectedChallenge) return sendJson(response, 400, { error: 'challenge_expired' });
    let result;
    try {
      result = await ctx.webauthn.verifyRegistrationResponse({ response: body.response, expectedChallenge,
        expectedOrigin: EXPECTED_ORIGIN, expectedRPID: RP_ID, requireUserVerification: false });
    } catch { result = { verified: false }; }
    const credential = result.registrationInfo?.credential;
    if (!result.verified || !credential) return sendJson(response, 400, { error: 'device_registration_failed' });
    await rest(ctx.fetchImpl, table(ctx.supabaseUrl, 'device_credentials'), ctx.key, { method: 'POST',
      body: JSON.stringify({ id: credential.id, owner_id: ctx.owner,
        public_key: isoBase64URL.fromBuffer(credential.publicKey), counter: credential.counter, approved: false }) });
    return sendJson(response, 200, { status: 'pending' });
  } catch {
    return sendJson(response, 500, { error: 'device_flow_unavailable' });
  }
}

export async function handleDeviceVerify(request, response, options = {}) {
  const started = await startFlow(request, response, options);
  if (!started) return undefined;
  const { body, ctx } = started;
  try {
    const credentials = await credentialsOf(ctx);
    if (!body.response) {
      if (!credentials.length) return sendJson(response, 200, { status: 'not_requested' });
      const authentication = await ctx.webauthn.generateAuthenticationOptions({ rpID: RP_ID,
        allowCredentials: credentials.map(item => ({ id: item.id })), userVerification: 'preferred' });
      await saveChallenge(ctx, 'verify', authentication.challenge);
      return sendJson(response, 200, { options: authentication });
    }
    const expectedChallenge = await takeChallenge(ctx, 'verify');
    if (!expectedChallenge) return sendJson(response, 400, { error: 'challenge_expired' });
    const stored = credentials.find(item => item.id === body.response.id);
    if (!stored) return sendJson(response, 403, { error: 'device_not_registered' });
    let result;
    try {
      result = await ctx.webauthn.verifyAuthenticationResponse({ response: body.response, expectedChallenge,
        expectedOrigin: EXPECTED_ORIGIN, expectedRPID: RP_ID, requireUserVerification: false,
        credential: { id: stored.id, publicKey: isoBase64URL.toBuffer(stored.public_key), counter: Number(stored.counter) } });
    } catch { result = { verified: false }; }
    if (!result.verified) return sendJson(response, 403, { error: 'device_verification_failed' });
    const counterUrl = table(ctx.supabaseUrl, 'device_credentials');
    counterUrl.searchParams.set('id', `eq.${stored.id}`);
    counterUrl.searchParams.set('owner_id', `eq.${ctx.owner}`);
    await rest(ctx.fetchImpl, counterUrl, ctx.key, { method: 'PATCH',
      body: JSON.stringify({ counter: result.authenticationInfo.newCounter }) });
    // 서명이 맞아도 서버 DB에서 승인되지 않은 기기면 세션을 주지 않습니다.
    if (stored.approved !== true) return sendJson(response, 200, { status: 'pending' });
    const session = newDeviceSession();
    const expiresAt = new Date(ctx.now() + DEVICE_SESSION_SECONDS * 1000).toISOString();
    await rest(ctx.fetchImpl, table(ctx.supabaseUrl, 'device_sessions'), ctx.key, { method: 'POST',
      body: JSON.stringify({ token_sha256: session.tokenSha256, owner_id: ctx.owner, credential_id: stored.id,
        expires_at: expiresAt }) });
    return sendJson(response, 200, { status: 'approved', deviceSession: session.token, expiresAt });
  } catch {
    return sendJson(response, 500, { error: 'device_flow_unavailable' });
  }
}
