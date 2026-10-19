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

// 14단계 renderDecision: 서버 판정값별 표시 문구입니다. 화면에는 원래 값(allow 등)을 함께 적습니다.
const DECISION_STATUS = {
  allow: { label: '접근 허용(allow)', note: '정책상 접근이 허용됐다는 뜻이며, 실제 앱 접속 성공을 보장하지 않습니다.' },
  deny: { label: '접근 거부(deny)', note: '서버 정책이 이 앱 접근을 거부했습니다.' },
  challenge: { label: '추가 확인 필요(challenge)', note: '추가 인증 또는 확인이 필요합니다. 이 앱은 추가 인증 절차를 대신 수행하지 않으며, 아직 허용되지 않았습니다.' },
  unknown: { label: '확인 불가(unknown)', note: '서버가 판정을 확정하지 못했습니다. 허용되지 않음으로 보고, 허용으로 간주하지 마세요.' },
};

function formatCheckedAt(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return `확인 불가 (${valueOr(value)})`;
  return `${new Date(value).toLocaleString('ko-KR')} (${value})`;
}

function decisionLines(data, requestedAppId) {
  const record = data && typeof data === 'object' ? data : {};
  // 요청한 앱과 다른 앱의 판정이거나 목록에 없는 값이면 확인 불가로 표시합니다.
  const sameApp = typeof record.appId === 'string' && record.appId === requestedAppId;
  const known = sameApp && Object.hasOwn(DECISION_STATUS, record.decision);
  const key = known ? record.decision : 'unknown';
  const entry = DECISION_STATUS[key];
  const received = known || record.decision === 'unknown' ? '' : ` · 받은 값: ${valueOr(record.decision)}${sameApp ? '' : ' (요청한 앱과 다른 판정)'}`;
  return [
    textNode('p', `판정: ${entry.label}${received}`, `decision decision-${key}`),
    textNode('p', entry.note),
    textNode('p', `앱 ID: ${valueOr(record.appId ?? requestedAppId)}`),
    textNode('p', `판정 이유: ${valueOr(record.reason)}`),
    textNode('p', `판정 시각: ${formatCheckedAt(record.checkedAt)}`),
  ];
}

// 15단계 renderEvents: 기록 종류·접속 상태 표시 문구입니다. 원래 값은 괄호로 함께 적습니다.
const EVENT_KIND = { access: '접속 기록', xdr: 'XDR 경보' };
const ACCESS_STATE = { allowed: '접속 허용됨', denied: '접속 거부됨', unknown: '확인 불가' };
const ALL = 'all';
const NO_APP = '';

const labelWith = (label, value) => `${label}(${valueOr(value)})`;
function tableLabel(table, value) {
  const entry = Object.hasOwn(table, value) ? table[value] : null;
  if (!entry) return labelWith('확인 불가', value);
  return labelWith(typeof entry === 'string' ? entry : entry.label, value);
}
const appText = (appId) => (typeof appId === 'string' && appId !== '' ? appId : '앱 확인 불가(appId 없음)');
const timeOf = (event) => {
  const ms = Date.parse(event.at);
  return Number.isFinite(ms) ? ms : -Infinity;
};

function eventFilter(id, label, options, value, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'student-filter';
  const caption = textNode('label', label);
  caption.htmlFor = id;
  const select = document.createElement('select');
  select.id = id;
  select.setAttribute('aria-label', label);
  for (const [optionValue, optionText] of options) {
    const option = textNode('option', optionText);
    option.value = optionValue;
    select.append(option);
  }
  select.value = value;
  select.addEventListener('change', () => onChange(select.value));
  wrap.append(caption, select);
  return wrap;
}

function textEntries(title, entries) {
  const block = document.createElement('div');
  block.append(textNode('h4', title));
  if (!Array.isArray(entries) || entries.length === 0) {
    block.append(textNode('p', `${title} 없음(빈 목록)`, 'muted'));
    return block;
  }
  const list = document.createElement('ul');
  for (const entry of entries) list.append(textNode('li', `${valueOr(entry && entry.id)}: ${valueOr(entry && entry.text)}`));
  block.append(list);
  return block;
}

function eventDetail(event) {
  const detail = document.createElement('section');
  detail.className = 'student-event-detail';
  detail.setAttribute('data-student-event-detail', event.id);
  const state = event.state && typeof event.state === 'object' ? event.state : {};
  detail.append(
    textNode('h4', `${valueOr(event.id)} 상세`),
    textNode('p', `사건 ID: ${valueOr(event.id)} · 앱 ID: ${appText(event.appId)}`),
    textNode('p', `종류: ${tableLabel(EVENT_KIND, event.kind)} · 시각: ${formatCheckedAt(event.at)}`),
    textNode('p', `요약: ${valueOr(event.summary)}`),
    textEntries('근거(evidence)', event.evidence),
    textEntries('규칙(rules)', event.rules),
    textNode('h4', '상태'),
    textNode('p', `접속 상태(access): ${tableLabel(ACCESS_STATE, state.access)}`, state.access === 'allowed' ? 'state state-ok' : state.access === 'denied' ? 'state state-error' : 'state state-empty'),
    textNode('p', `세션 상태(session): ${tableLabel(SESSION_STATUS, state.session)}`, `state state-${statusText(SESSION_STATUS, state.session).tone}`),
    textNode('p', `기기 상태(device): ${tableLabel(DEVICE_STATUS, state.device)}`, `state state-${statusText(DEVICE_STATUS, state.device).tone}`),
  );
  return detail;
}

function uniqueOptions(values, labelOf) {
  return [...new Set(values)].map((value) => [value, labelOf(value)]);
}

// 기록 목록입니다. 필터와 상세 선택은 이 호출 안에서만 유지하므로, 새 자료로 다시 호출되면 모두 초기화됩니다.
function eventList(events) {
  const container = document.createElement('div');
  const sorted = [...events].sort((a, b) => timeOf(b) - timeOf(a));
  const filters = { kind: ALL, app: ALL, access: ALL };
  let selectedId = null;

  const appValue = (event) => (typeof event.appId === 'string' && event.appId !== '' ? event.appId : NO_APP);
  const kindOptions = [[ALL, '전체'], ...uniqueOptions(sorted.map((e) => e.kind), (v) => tableLabel(EVENT_KIND, v))];
  const appOptions = [[ALL, '전체'], ...uniqueOptions(sorted.map(appValue), (v) => (v === NO_APP ? appText(null) : v))];
  const accessOptions = [[ALL, '전체'], ...uniqueOptions(sorted.map((e) => e.state && e.state.access), (v) => tableLabel(ACCESS_STATE, v))];

  const body = document.createElement('div');
  const redraw = () => {
    const shown = sorted.filter((e) => (filters.kind === ALL || e.kind === filters.kind)
      && (filters.app === ALL || appValue(e) === filters.app)
      && (filters.access === ALL || (e.state && e.state.access) === filters.access));
    if (!shown.some((e) => e.id === selectedId)) selectedId = null;
    const nodes = [textNode('p', `표시 ${shown.length}건 / 받은 기록 ${sorted.length}건 (본인 최근 기록, 최대 40건 · 최신순)`)];
    if (shown.length === 0) {
      nodes.push(textNode('p', '선택한 조건에 맞는 기록이 없습니다. 필터를 전체(all)로 바꿔 보세요.', 'state state-empty'));
    } else {
      const list = document.createElement('ul');
      list.className = 'student-event-list';
      for (const event of shown) {
        const row = document.createElement('li');
        row.setAttribute('data-student-event-id', event.id);
        row.append(textNode('p', `${valueOr(event.id)} · ${formatCheckedAt(event.at)} · ${tableLabel(EVENT_KIND, event.kind)} · 앱 ${appText(event.appId)} · ${valueOr(event.summary)}`));
        const button = textNode('button', `${valueOr(event.id)} 상세`, 'btn');
        button.type = 'button';
        button.setAttribute('aria-label', `${event.id} 상세`);
        button.setAttribute('aria-expanded', String(event.id === selectedId));
        button.addEventListener('click', () => { selectedId = selectedId === event.id ? null : event.id; redraw(); });
        row.append(button);
        if (event.id === selectedId) row.append(eventDetail(event));
        list.append(row);
      }
      nodes.push(list);
    }
    body.replaceChildren(...nodes);
  };

  const controls = document.createElement('div');
  controls.className = 'student-filters';
  controls.append(
    eventFilter('student-filter-kind', '기록 종류', kindOptions, filters.kind, (v) => { filters.kind = v; redraw(); }),
    eventFilter('student-filter-app', '업무 앱', appOptions, filters.app, (v) => { filters.app = v; redraw(); }),
    eventFilter('student-filter-access', '접속 상태', accessOptions, filters.access, (v) => { filters.access = v; redraw(); }),
  );
  container.append(controls, body);
  redraw();
  return container;
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
    // 입력이 바뀔 때마다 새 DOM 요소 하나를 돌려줍니다. 다시 불러오기로 idle 이 오면 이전 판정은 남지 않습니다.
    renderDecision({ status, mode, data, error, appId } = {}) {
      const root = document.createElement('div');
      root.className = 'student-decision';
      root.append(textNode('h3', '업무 앱 접근 판정'));
      if (Object.hasOwn(MODE_NOTICE, mode)) {
        root.append(textNode('p', MODE_NOTICE[mode], mode === 'demo' ? 'tag tag-demo' : 'tag'));
      }
      if (status === 'idle') {
        root.append(textNode('p', '아직 요청한 앱이 없습니다. 업무 앱 메뉴에서 앱을 골라 접속을 요청하세요.', 'state state-empty'));
      } else if (status === 'loading') {
        root.append(textNode('p', `판정 확인 중… (앱 ID ${valueOr(appId)}) 아직 판정을 받지 않았습니다.`, 'state state-loading'));
      } else if (status === 'error') {
        const unverified = error && UNVERIFIED_CODES.has(error.code);
        root.append(
          textNode('p', `${unverified ? '요청 실패(판정 확인 불가)' : '요청 실패'}: ${valueOr(error && error.message)}`, 'decision decision-failed'),
          textNode('p', `앱 ID ${valueOr(appId)} · 이것은 접근 거부(deny) 판정이 아니며, 허용된 것도 아닙니다. 필요하면 앱 버튼을 다시 눌러 직접 요청하세요.`),
        );
      } else if (status === 'ok') {
        root.append(...decisionLines(data, appId));
      } else {
        root.append(textNode('p', '확인 불가(unknown): 알 수 없는 응답 상태입니다. 허용으로 간주하지 마세요.', 'state state-empty'));
      }
      return root;
    },
    // 새 자료로 호출될 때마다 새 DOM 요소를 돌려줍니다. 이전 목록·필터·상세 선택은 남지 않습니다.
    renderEvents({ status, mode, data, error } = {}) {
      const root = document.createElement('div');
      root.className = 'student-events';
      root.append(textNode('h3', '내 접속 기록·XDR 경보'));
      if (Object.hasOwn(MODE_NOTICE, mode)) {
        root.append(textNode('p', MODE_NOTICE[mode], mode === 'demo' ? 'tag tag-demo' : 'tag'));
      }
      if (status === 'loading') {
        root.append(textNode('p', '기록을 불러오는 중… 아직 받은 기록이 없습니다.', 'state state-loading'));
      } else if (status === 'error') {
        const unverified = error && UNVERIFIED_CODES.has(error.code);
        root.append(
          textNode('p', `${unverified ? '확인 불가: ' : ''}기록을 불러오지 못했습니다: ${valueOr(error && error.message)}`, 'state state-error'),
          textNode('p', '조회에 실패했으므로 기록이 없다는 뜻이 아닙니다. 이전 목록은 현재 결과가 아니므로 표시하지 않습니다.'),
        );
      } else if (status === 'ok' && Array.isArray(data)) {
        if (data.length === 0) root.append(textNode('p', '표시할 기록이 없습니다. 조회는 성공했고 본인 최근 기록이 0건입니다.', 'state state-empty'));
        else root.append(eventList(data));
      } else {
        root.append(textNode('p', '확인 불가: 알 수 없는 응답 상태입니다. 기록이 없다는 뜻이 아닙니다.', 'state state-empty'));
      }
      return root;
    },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
