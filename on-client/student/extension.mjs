// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.

// 13단계 renderIdentity: 상태값별 표시 문구입니다. 화면에는 원래 값(compliant 등)도 함께 적습니다.
// tone 은 색상 구분용이며, 정상이 아닌 상태는 문구로도 주의를 붙입니다.
const DEVICE_STATUS = {
  compliant: { label: '보안 기준 충족', tone: 'ok' },
  noncompliant: { label: '보안 기준 미충족', tone: 'error', note: '주의: 정상 상태가 아닙니다' },
  unknown: { label: '확인 불가', tone: 'empty', note: '정상으로 간주하지 않습니다' },
};
const SESSION_STATUS = {
  active: { label: '활성', tone: 'ok' },
  expired: { label: '만료', tone: 'error', note: '주의: 사용할 수 없는 세션입니다' },
  revoked: { label: '철회됨', tone: 'error', note: '주의: 사용할 수 없는 세션입니다' },
  unknown: { label: '확인 불가', tone: 'empty', note: '정상으로 간주하지 않습니다' },
};
// loading·ok·error 어느 상태든 전달받은 mode 가 아래 셋이면 함께 표시합니다.
const MODE_NOTICE = {
  demo: '예제 자료(demo) · 실제 연결 결과가 아닙니다',
  disconnected: '연결 없음(disconnected) · 회사 시스템에 연결되지 않았습니다',
  unknown: '확인 불가(unknown) · 연결 상태를 확인할 수 없습니다',
};
// 응답 형식이 맞지 않는 오류는 연결 실패가 아니라 확인 불가입니다.
const UNVERIFIED_CODES = new Set(['CONTRACT_MISMATCH', 'ENGINE_RESULT_UNVERIFIED']);

function textNode(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

const valueOr = (value) => (typeof value === 'string' && value !== '' ? value : '확인 불가');

function statusText(table, value) {
  const entry = Object.hasOwn(table, value) ? table[value] : null;
  if (!entry) return { text: `확인 불가 (알 수 없는 값: ${valueOr(value)})`, tone: 'empty' };
  return { text: `${entry.label} (${value})${entry.note ? ` · ${entry.note}` : ''}`, tone: entry.tone };
}

// 자료 하나(me·devices·sessions)의 칸입니다. 매번 새 요소를 만들어 이전 값을 남기지 않습니다.
function resourceSection(title, resource, renderOk) {
  const section = document.createElement('section');
  section.className = 'student-identity-part';
  section.append(textNode('h3', title));
  const current = resource && typeof resource === 'object' ? resource : { status: null };
  if (Object.hasOwn(MODE_NOTICE, current.mode)) {
    section.append(textNode('p', MODE_NOTICE[current.mode], current.mode === 'demo' ? 'tag tag-demo' : 'tag'));
  }
  if (current.status === 'loading') {
    section.append(textNode('p', '불러오는 중… 아직 확인된 값이 없습니다.', 'state state-loading'));
  } else if (current.status === 'error') {
    const message = valueOr(current.error && current.error.message);
    const prefix = current.error && UNVERIFIED_CODES.has(current.error.code)
      ? '확인 불가: 서버 응답 형식을 확인할 수 없습니다'
      : '연결 실패: 서버에 연결하지 못했습니다';
    section.append(textNode('p', `${prefix} · ${message}`, 'state state-error'));
  } else if (current.status === 'ok') {
    section.append(renderOk(current.data));
  } else {
    section.append(textNode('p', '확인 불가: 알 수 없는 응답 상태입니다.', 'state state-empty'));
  }
  return section;
}

function statusLine(label, status) {
  return textNode('p', `${label}: ${status.text}`, `state state-${status.tone}`);
}

function renderMe(data) {
  const box = document.createElement('div');
  const user = data && data.user ? data.user : {};
  const device = data && data.device ? data.device : {};
  const session = data && data.session ? data.session : {};
  box.append(
    textNode('p', `사용자: ${valueOr(user.label)} (ID ${valueOr(user.id)})`),
    textNode('p', `현재 기기: ${valueOr(device.label)} (ID ${valueOr(device.id)})`),
    statusLine('기기 보안 상태', statusText(DEVICE_STATUS, device.status)),
    textNode('p', `로그인 세션: ID ${valueOr(session.id)}`),
    statusLine('세션 상태', statusText(SESSION_STATUS, session.status)),
  );
  return box;
}

function renderList(rows, emptyText, renderRow) {
  if (!Array.isArray(rows)) return textNode('p', '확인 불가: 목록 형식이 아닙니다.', 'state state-empty');
  if (rows.length === 0) return textNode('p', emptyText, 'state state-empty');
  const list = document.createElement('ul');
  for (const row of rows) list.append(renderRow(row || {}));
  return list;
}

function deviceRow(row) {
  const status = statusText(DEVICE_STATUS, row.status);
  return textNode('li', `${valueOr(row.label)} (ID ${valueOr(row.id)}) · ${status.text}`, `state state-${status.tone}`);
}

function sessionRow(row) {
  const status = statusText(SESSION_STATUS, row.status);
  return textNode('li', `세션 ID ${valueOr(row.id)} · ${status.text}`, `state state-${status.tone}`);
}

export function createStudentView() {
  return {
    // 입력이 바뀔 때마다 새 DOM 요소 하나를 돌려줍니다. 이전 호출의 사용자·기기·세션 값은 저장하지 않으므로
    // 다시 불러오기나 오류가 오면 제공 UI가 학생 칸을 이 새 요소로 통째로 교체합니다.
    renderIdentity({ me, devices, sessions } = {}) {
      const root = document.createElement('div');
      root.className = 'student-identity';
      root.append(
        resourceSection('현재 로그인 (계정·기기·세션)', me, renderMe),
        resourceSection('내 기기 목록', devices, (data) => renderList(data, '등록된 기기가 없습니다.', deviceRow)),
        resourceSection('내 로그인 세션 목록', sessions, (data) => renderList(data, '로그인 세션이 없습니다.', sessionRow)),
        textNode('p', '기기 보안 상태는 서버가 알려 준 값이며, 악성코드 검사나 치료 결과가 아닙니다.', 'muted'),
      );
      return root;
    },
    renderDecision() { return '학생 구현 대기: 서버의 판정과 이유를 연결하세요.'; },
    renderEvents() { return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.'; },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
