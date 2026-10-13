// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 6단계부터 규칙을 하나씩 추가합니다. 규칙에 맞지 않는 요청은 기본으로 거부합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['starter.deny', 'device_registered']);

// 6단계: 내 자료실 읽기 경로입니다. 엔진이 확인한 route 모양과 비교합니다.
const READ_ROUTES = new Set(['GET /notes', 'GET /notes/:id']);

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
  if (request.service === 'notes' && request.method === 'GET' && READ_ROUTES.has(request.route)) {
    return respond(request, 'allow', 'approved', 'device_registered');
  }
  return respond(request, 'deny', 'starter_not_ready', 'starter.deny');
}
