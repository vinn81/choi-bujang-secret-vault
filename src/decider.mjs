// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 6단계부터 규칙을 하나씩 추가합니다. 규칙에 맞지 않는 요청은 기본으로 거부합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['starter.deny', 'device_registered', 'step_up_required']);

// 6단계: 내 자료실 읽기 경로입니다. 엔진이 확인한 route 모양과 비교합니다.
const READ_ROUTES = new Set(['GET /notes', 'GET /notes/:id']);

// 7단계 입력 검사: 엔진이 넘긴 signals·recentEvents만 읽습니다.
// 출처가 judge_fixture(심판 가상 신호)일 때만 지역·네트워크·시각을 값으로 인정합니다.
// 'none'이나 그 밖의 출처(클라이언트 헤더 등)는 값을 버리고, 없는 값은 null로 둡니다.
const TRUSTED_SIGNAL_SOURCE = 'judge_fixture';
const MAX_RECENT_EVENTS = 12;

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const knownText = value => (typeof value === 'string' && value !== '' && value !== 'unknown' ? value : null);
const validHour = value => (Number.isInteger(value) && value >= 0 && value <= 23 ? value : null);
const validEvent = event => isPlainObject(event)
  && typeof event.kind === 'string' && event.kind !== ''
  && Number.isFinite(event.ageSeconds) && event.ageSeconds >= 0
  && Number.isInteger(event.count) && event.count >= 1;

export function readAccessContext(request) {
  const signals = isPlainObject(request.signals) ? request.signals : null;
  const rawSource = typeof signals?.source === 'string' ? signals.source : null;
  const trusted = rawSource === TRUSTED_SIGNAL_SOURCE;
  const events = request.recentEvents;
  return {
    source: trusted ? TRUSTED_SIGNAL_SOURCE : rawSource === 'none' ? 'none' : 'untrusted',
    region: trusted ? knownText(signals.region) : null,
    network: trusted ? knownText(signals.network) : null,
    hour: trusted ? validHour(signals.hour) : null,
    // 형식이 틀리면 '사건 없음([])'으로 바꾸지 않고 알 수 없음(null)으로 둡니다.
    recentEvents: Array.isArray(events) && events.length <= MAX_RECENT_EVENTS
      && events.every(validEvent) ? events.map(({ kind, ageSeconds, count }) => ({ kind, ageSeconds, count }))
      : null,
  };
}

// 7단계 step_up_required: 평소와 다른 시각 + 처음 보는 네트워크 + 최근 대량 읽기가
// 모두 겹칠 때만 차단 대신 다시 로그인(step_up)을 요구합니다. 지역(region)은 조건에 넣지 않습니다.
const UNUSUAL_HOURS = new Set([0, 1, 2, 3, 4, 5]);
const UNFAMILIAR_NETWORK = 'unusual';
const BURST_WINDOW_SECONDS = 600;
const BURST_MIN_COUNT = 10;
const STEP_UP_MAX_AGE_SECONDS = 300;

function needsStepUp(context) {
  if (context.source !== TRUSTED_SIGNAL_SOURCE || context.recentEvents === null) return false;
  const burstCount = context.recentEvents
    .filter(event => event.ageSeconds <= BURST_WINDOW_SECONDS)
    .reduce((sum, event) => sum + event.count, 0);
  return context.hour !== null && UNUSUAL_HOURS.has(context.hour)
    && context.network === UNFAMILIAR_NETWORK
    && burstCount >= BURST_MIN_COUNT;
}

// 엔진이 검증한 최근 재로그인만 인정합니다.
const recentlyVerified = stepUp => isPlainObject(stepUp) && stepUp.verified === true
  && Number.isInteger(stepUp.authAgeSeconds)
  && stepUp.authAgeSeconds >= 0 && stepUp.authAgeSeconds <= STEP_UP_MAX_AGE_SECONDS;

const respond = (request, decision, reasonCode, ruleId) => ({
  schema: 'aleph.decision.v1',
  requestId: request.requestId,
  decision,
  reasonCode,
  ruleIds: [ruleId],
});

export async function decide(request) {
  // 6단계 device_registered: 등록 기기(true)가 아니면 값이 없어도 거부합니다.
  if (request.deviceRegistered !== true) {
    return respond(request, 'deny', 'device_not_registered', 'device_registered');
  }
  if (needsStepUp(readAccessContext(request)) && !recentlyVerified(request.stepUp)) {
    return respond(request, 'step_up', 'step_up_required', 'step_up_required');
  }
  if (request.service === 'notes' && request.method === 'GET' && READ_ROUTES.has(request.route)) {
    return respond(request, 'allow', 'approved', 'device_registered');
  }
  return respond(request, 'deny', 'starter_not_ready', 'starter.deny');
}
