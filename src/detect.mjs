// 9단계에서 학생이 채우는 탐지 함수입니다. 이 기본값은 어떤 접속도 회수하지 않습니다.
// 반 엔진이 검증한 사건만 전달해야 하며, 브라우저가 보낸 사용자 번호는 받지 않습니다.

// 9단계 입력 정리: 사건에서 가명 사용자·기기·요청 종류·판정·시각만 꺼내 새 객체로 만듭니다.
// 메모 내용·토큰·실명 같은 나머지 값은 복사하지 않으므로 저장되거나 출력되지 않습니다.
// docs/DETECT_EVENTS.md 계약의 값은 at·method·identity.sub입니다. deviceId·decision은 계약에 없어
// 형식이 맞을 때만 읽고, 없거나 틀리면 null로 둡니다(임의 값으로 채우지 않음).
const SUBJECT = /^[A-Za-z0-9_-]{1,128}$/u;
const DEVICE_ID = /^[0-9a-f]{16}$/u;
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const DECISIONS = new Set(['allow', 'deny', 'step_up']);

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function readEvent(event) {
  if (!isPlainObject(event) || !isPlainObject(event.identity)) return null;
  const subject = event.identity.sub;
  if (typeof subject !== 'string' || !SUBJECT.test(subject)) return null;
  if (typeof event.method !== 'string' || !METHODS.has(event.method)) return null;
  const time = typeof event.at === 'string' ? Date.parse(event.at) : Number.NaN;
  if (!Number.isFinite(time) || new Date(time).toISOString() !== event.at) return null;
  return Object.freeze({
    subject,
    deviceId: typeof event.deviceId === 'string' && DEVICE_ID.test(event.deviceId) ? event.deviceId : null,
    method: event.method,
    decision: DECISIONS.has(event.decision) ? event.decision : null,
    time,
  });
}

// 형식이 틀린 사건은 세지 않고 버립니다.
export function readDetectionEvents(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  return events.map(readEvent).filter(Boolean);
}

// 9단계 burst_read: 같은 가명 사용자의 GET 조회가 어느 10분 구간에서든 120건을 넘을 때만 회수를 제안합니다.
// 정확히 120건, 다른 사용자끼리의 합산, 10분 밖의 조회는 세지 않습니다. 지역·네트워크는 근거로 쓰지 않습니다.
const BURST_WINDOW_MS = 10 * 60 * 1000;
const BURST_LIMIT = 120;

// 사용자마다 처음 120건을 넘은 10분 구간(그 안의 조회들)을 찾습니다. 넘지 않으면 null입니다.
function firstBurst(reads) {
  reads.sort((a, b) => a.time - b.time);
  for (let start = 0, end = 0; end < reads.length; end += 1) {
    while (reads[end].time - reads[start].time >= BURST_WINDOW_MS) start += 1;
    if (end - start + 1 > BURST_LIMIT) return { at: reads[end].time, window: reads.slice(start, end + 1) };
  }
  return null;
}

// 여러 사용자가 넘으면 가장 먼저 넘은 사용자 하나를 고릅니다.
function findBurst(events) {
  const readsBySubject = new Map();
  for (const event of readDetectionEvents(events)) {
    if (event.method !== 'GET') continue;
    if (!readsBySubject.has(event.subject)) readsBySubject.set(event.subject, []);
    readsBySubject.get(event.subject).push(event);
  }
  let found = null;
  for (const [subject, reads] of readsBySubject) {
    const burst = firstBurst(reads);
    if (burst && (found === null || burst.at < found.at)) found = { subject, ...burst };
  }
  return found;
}

// 계약(docs/DETECT_EVENTS.md)의 탐지 응답입니다. 세 항목 형식을 바꾸지 않습니다.
export function detect(events) {
  const found = findBurst(events);
  return found
    ? { action: 'propose_revocation', reasonCode: 'burst_read', subject: found.subject }
    : { action: 'observe' };
}

// 9단계 별도 결과: 탐지한 사건의 회수 제안입니다. 판정기의 허용·거부 응답과는 따로 냅니다.
// 대상 기기는 폭주 구간의 조회가 모두 같은 확인된 기기 ID 하나일 때만 적습니다.
// 기기 정보가 없거나 여러 기기가 섞이면 deviceId는 null(기기 미확인)이며, 다른 기기로 넓히지 않습니다.
// 이 함수는 제안만 만들고 회수 API 호출이나 기기 권한 변경을 하지 않습니다. 실제 회수와 시간은 심판이 확인합니다.
export function revocationProposal(events) {
  const found = findBurst(events);
  if (!found) return null;
  const devices = new Set(found.window.map(read => read.deviceId));
  const [only] = devices;
  return Object.freeze({
    action: 'propose_revocation',
    reasonCode: 'burst_read',
    subject: found.subject,
    deviceId: devices.size === 1 && only !== null ? only : null,
    readsInWindow: found.window.length,
  });
}
