import { randomUUID } from 'node:crypto';
import { serviceHeaders, table } from './device.mjs';

// 12단계: 자료 API가 받은 요청을 학습 DB(access_log)에 한 줄씩 남기는 서버 요청 기록입니다.
// 요청 ID(x-request-id, 없으면 서버가 만듦)·점검 이름(x-aleph-attack-id)·방법·경로·상태·시각만 적고,
// 메모 본문·토큰·요청 본문은 적지 않습니다. 로그인한 요청은 소유자 키만 남기고, 비로그인 요청은 소유자 없음(null)입니다.
// 기록 저장이 실패해도 원래 응답은 그대로 보냅니다.
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const ATTACK_ID = /^[a-z0-9][a-z0-9_.-]{0,79}$/iu;
export const ACCESS_OWNER = Symbol('accessOwner');

function header(request, name) {
  const value = typeof request.headers?.get === 'function' ? request.headers.get(name) : request.headers?.[name];
  return typeof value === 'string' ? value : '';
}

export function accessRequestId(request) {
  const value = header(request, 'x-request-id');
  return REQUEST_ID.test(value) ? value.toLowerCase() : randomUUID();
}

export async function recordAccess(row, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  try {
    const supabaseUrl = new URL(env.SUPABASE_URL?.trim());
    const secretKey = env.SUPABASE_SECRET_KEY?.trim();
    if (supabaseUrl.protocol !== 'https:' || !secretKey) return false;
    const upstream = await fetchImpl(table(supabaseUrl, 'access_log'), {
      method: 'POST',
      headers: serviceHeaders(secretKey, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify(row),
      redirect: 'error',
      signal: AbortSignal.timeout(3000),
    });
    return upstream.ok;
  } catch {
    return false;
  }
}

// 응답을 보내기 직전에 기록을 남기도록 response.json·end를 감쌉니다. 기록이 끝난 뒤 원래 응답을 보냅니다.
export function withAccessLog(route, handler, options = {}) {
  return async (request, response) => {
    const requestId = accessRequestId(request);
    const attackId = header(request, 'x-aleph-attack-id');
    response.setHeader('X-Request-Id', requestId);
    let status = 200;
    let pending = null;
    const record = () => {
      pending ??= saveRow();
      return pending;
    };
    const saveRow = async () => {
      const owner = request[ACCESS_OWNER];
      await recordAccess({
        request_id: requestId,
        attack_id: ATTACK_ID.test(attackId) ? attackId : null,
        method: typeof request.method === 'string' ? request.method.slice(0, 10) : 'UNKNOWN',
        route,
        status,
        owner_id: REQUEST_ID.test(owner ?? '') ? owner : null,
      }, options);
    };
    const { status: setStatus, json, end } = response;
    response.status = code => { status = code; return setStatus.call(response, code); };
    response.json = body => record().then(() => json.call(response, body));
    response.end = (...args) => record().then(() => end.apply(response, args));
    // 응답을 기다리지 않고 돌아오는 경로(인증 실패 등)도 기록과 응답이 끝날 때까지 기다립니다.
    const result = await handler(request, response);
    if (pending) await pending.then(() => new Promise(resolve => setImmediate(resolve)));
    return result;
  };
}
