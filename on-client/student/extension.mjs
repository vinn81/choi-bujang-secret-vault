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
  const unsupported = unsupportedActions(event.supportedActions);
  if (unsupported) detail.append(unsupported);
  return detail;
}

// 16단계: 연결되지 않은 조치가 넘어온 경우에만 비활성 안내 버튼을 둡니다. 목록이 비어 있으면 아무것도 만들지 않습니다.
// 버튼은 비활성이며 클릭 처리기를 달지 않으므로 어떤 요청도 보내지 않습니다.
function unsupportedActions(actions) {
  if (!Array.isArray(actions) || actions.length === 0) return null;
  const block = document.createElement('div');
  block.className = 'student-unsupported-actions';
  block.append(
    textNode('h4', '조치(supportedActions)'),
    textNode('p', '아직 지원하지 않는 조치입니다. 조치 실행 연결은 준비 중이며, 이 버튼은 요청을 보내지 않고 어떤 조치도 실행하지 않습니다.', 'state state-empty'),
  );
  for (const action of actions) {
    const button = textNode('button', `${valueOr(action)} 미지원`, 'btn');
    button.type = 'button';
    button.disabled = true;
    block.append(button);
  }
  return block;
}

// 16단계 renderStatus: 알림이 어느 자료에서 왔는지 보여 줄 이름입니다. 원래 값은 괄호로 함께 적습니다.
const RESOURCE_NAME = {
  me: '로그인 정보', apps: '업무 앱', events: '보안 기록', devices: '기기', sessions: '세션',
  access: '접속 판정', diagnostics: '도움정보', vulnerabilities: '설치 패키지 조회',
};
// 조회 실패가 아니라 상태 주의를 뜻하는 알림 code 입니다(기기·세션 상태, 기록 종류).
const ATTENTION_CODES = new Set(['noncompliant', 'unknown', 'expired', 'revoked', 'xdr', 'access']);
const SAFE_CODE = /^[A-Za-z0-9_.-]{1,64}$/u;
const safeCode = (code) => (typeof code === 'string' && SAFE_CODE.test(code) ? code : '확인 불가');
const isTimeout = (error) => typeof (error && error.code) === 'string' && error.code.includes('TIMEOUT');
const RETRY_HINT = '연결 상태를 확인한 뒤, 다시 시도는 위쪽 「다시 불러오기」 버튼을 직접 누르세요. 자동으로 다시 요청하지 않습니다.';

// 기기·세션 칸입니다. 불러오는 중·빈 목록·실패를 서로 다른 문장으로 보여 줍니다.
function statusResource(title, what, resource, emptyText, renderRow) {
  const section = document.createElement('section');
  section.className = 'student-status-part';
  section.append(textNode('h3', title));
  const current = resource && typeof resource === 'object' ? resource : { status: null };
  if (current.status === 'loading') {
    section.append(textNode('p', `${what}을 불러오는 중… 아직 확인된 값이 없습니다.`, 'state state-loading'));
  } else if (current.status === 'error') {
    const error = current.error || {};
    const kind = isTimeout(error) ? '시간 초과' : UNVERIFIED_CODES.has(error.code) ? '확인 불가(응답 형식 불일치)' : '조회 실패';
    section.append(
      textNode('p', `${kind}: ${what}을 불러오지 못했습니다 (${safeCode(error.code)}) · ${valueOr(error.message)}`, 'state state-error'),
      textNode('p', `실패했으므로 ${what}이 없다는 뜻이 아닙니다. ${RETRY_HINT}`),
    );
  } else if (current.status === 'ok' && Array.isArray(current.data)) {
    if (current.data.length === 0) section.append(textNode('p', emptyText, 'state state-empty'));
    else {
      const list = document.createElement('ul');
      for (const row of current.data) list.append(renderRow(row || {}));
      section.append(list);
    }
  } else {
    section.append(textNode('p', `확인 불가: ${what}의 응답 상태를 알 수 없습니다.`, 'state state-empty'));
  }
  return section;
}

function notificationList(notifications) {
  const section = document.createElement('section');
  section.className = 'student-status-part';
  section.append(textNode('h3', '알림'));
  if (!Array.isArray(notifications)) {
    section.append(textNode('p', '확인 불가: 알림 형식이 아닙니다.', 'state state-empty'));
    return section;
  }
  if (notifications.length === 0) {
    section.append(textNode('p', '주의할 알림이 없습니다.', 'state state-ok'));
    return section;
  }
  const list = document.createElement('ul');
  for (const item of notifications) {
    const entry = item || {};
    const resource = Object.hasOwn(RESOURCE_NAME, entry.resource) ? labelWith(RESOURCE_NAME[entry.resource], entry.resource) : labelWith('확인 불가', entry.resource);
    const code = safeCode(entry.code);
    const failed = !ATTENTION_CODES.has(code);
    const row = textNode('li', `${failed ? '조회 실패' : '주의'} · 자료: ${resource} · 코드: ${code} · 내용: ${valueOr(entry.message)}`, failed ? 'state state-error' : 'state state-empty');
    if (failed) row.append(textNode('p', RETRY_HINT));
    list.append(row);
  }
  section.append(list);
  return section;
}

// 진단 결과에서 보여 주고 복사할 값은 아래 여섯 개뿐입니다. 그 밖의 필드는 읽지 않습니다.
function safeDiagnostics(data) {
  const record = data && typeof data === 'object' ? data : {};
  const engine = record.engine && typeof record.engine === 'object' ? record.engine : {};
  const pick = (value) => (typeof value === 'string' && /^[^\r\n]{1,100}$/u.test(value) ? value : '확인 불가');
  return [
    ['requestId', pick(record.requestId)],
    ['component', pick(record.component)],
    ['version', pick(record.version)],
    ['checkedAt', pick(record.checkedAt)],
    ['engine.mode', pick(engine.mode)],
    ['engine.code', pick(engine.code)],
  ];
}

function diagnosticsSection(diagnostics) {
  const section = document.createElement('section');
  section.className = 'student-status-part';
  section.append(
    textNode('h3', '도움정보(진단)'),
    textNode('p', '도움 요청에 쓰도록 복사하는 정보입니다. 비밀번호·토큰·API 키는 포함하지 않으며, 아래 여섯 항목만 복사합니다.', 'muted'),
  );
  const current = diagnostics && typeof diagnostics === 'object' ? diagnostics : { status: null };
  const fields = current.status === 'ok' ? safeDiagnostics(current.data) : null;
  if (current.status === 'idle') {
    section.append(textNode('p', '도움정보를 아직 불러오지 않았습니다. 아래 제공 화면의 「도움정보 불러오기」를 누르면 여기에 표시됩니다.', 'state state-empty'));
  } else if (current.status === 'loading') {
    section.append(textNode('p', '도움정보를 불러오는 중…', 'state state-loading'));
  } else if (current.status === 'error') {
    const error = current.error || {};
    section.append(textNode('p', `${isTimeout(error) ? '시간 초과' : '조회 실패'}: 도움정보를 불러오지 못했습니다 (${safeCode(error.code)}) · ${valueOr(error.message)} · 다시 시도는 「도움정보 불러오기」 버튼을 직접 누르세요.`, 'state state-error'));
  } else if (fields) {
    const list = document.createElement('ul');
    for (const [key, value] of fields) list.append(textNode('li', `${key}: ${value}`));
    section.append(list);
  } else {
    section.append(textNode('p', '확인 불가: 도움정보의 응답 상태를 알 수 없습니다.', 'state state-empty'));
  }

  const copy = textNode('button', '도움정보 복사', 'btn');
  copy.type = 'button';
  copy.disabled = !fields;
  const result = textNode('p', fields ? '버튼을 누를 때만 위 여섯 항목을 클립보드에 복사합니다.' : '복사할 도움정보가 없습니다. 먼저 도움정보를 불러오세요.', 'muted');
  result.setAttribute('aria-live', 'polite');
  copy.addEventListener('click', async () => {
    if (!fields) return;
    const text = fields.map(([key, value]) => `${key}: ${value}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      result.textContent = '도움정보 여섯 항목을 클립보드에 복사했습니다. 붙여 넣기 전에 내용을 확인하세요.';
    } catch {
      result.textContent = '클립보드에 복사하지 못했습니다. 위 목록을 직접 선택해 Ctrl+C로 복사하세요.';
    }
  });
  section.append(copy, result);
  return section;
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

// 17단계 renderAiConnection: 오류 code 를 원인별로 나눈 안내입니다. 화면에는 code 와 제공 화면의 안전한 message 만 씁니다.
const AI_ERROR_GROUPS = [
  { codes: ['ON_AI_PROVISIONING_PENDING', 'ON_AI_AUTHORIZATION_CHANGED', 'SUBJECT_SCOPE_UNVERIFIED', 'AI_REQUEST_UNVERIFIED'],
    cause: '권한 준비 중·확인 불가', guide: '운영 측의 계정·앱 권한 준비가 끝나지 않았거나 확인할 수 없는 상태이며, 학생 코드의 잘못이 아닙니다. 담당자에게 계정 연결과 앱 권한 확인을 요청하세요.' },
  { codes: ['WB_CLCO_AUTH_REQUIRED'],
    cause: '인증 실패', guide: '계정 연결을 다시 확인하고, 계속되면 담당자에게 확인하세요. Workbench 열쇠나 AI 회사 원본 열쇠를 복사해 붙이지 마세요.' },
  { codes: ['WB_CLCO_ACCESS_BLOCKED'],
    cause: '접근 제한', guide: '계정 연결을 다시 확인하고, 담당자에게 학생 앱의 이용 권한을 확인하세요.' },
  { codes: ['WB_CLCO_COHORT_BUDGET_EXHAUSTED'],
    cause: '반 사용량 소진', guide: '담당자에게 확인하세요. 다시 점검해도 바로 풀리지 않습니다.' },
  { codes: ['WB_CLCO_LIMIT_REACHED'],
    cause: '이용 한도 도달', guide: '담당자에게 확인하세요. 다시 점검해도 바로 풀리지 않습니다.' },
  { codes: ['WB_CLCO_SESSION_CLOSED'],
    cause: '이용 시간 아님', guide: '수업용 AI 이용 시간을 확인한 뒤 직접 다시 점검하세요.' },
  { codes: ['WB_CLCO_RATE_LIMITED'],
    cause: '요청 제한', guide: '잠시 뒤 직접 다시 점검하세요.' },
  { codes: ['WB_CLCO_TIMEOUT', 'REQUEST_TIMEOUT', 'ENGINE_TIMEOUT', 'TIMEOUT'],
    cause: '시간 초과', guide: '응답이 제한 시간 안에 오지 않아 점검이 끝났습니다. 잠시 뒤 직접 다시 점검하세요.' },
  { codes: ['WB_CLCO_NETWORK_ERROR', 'WB_CLCO_SERVER_UNAVAILABLE', 'NETWORK_ERROR'],
    cause: '네트워크·서버 연결 문제', guide: '연결 상태를 확인하고 잠시 뒤 직접 다시 점검하세요.' },
  { codes: ['WB_CLCO_CANCELLED', 'CANCELLED', 'REQUEST_CANCELLED'],
    cause: '취소됨', guide: '점검을 취소했습니다. 이전 점검 결과는 현재 결과가 아니므로 표시하지 않습니다.' },
  { codes: ['ON_AI_MODEL_LIST_EMPTY', 'MODEL_NOT_CONFIGURED'],
    cause: '쓸 수 있는 모델 없음', guide: '담당자에게 모델 허용 설정 확인을 요청하세요.' },
];
const AI_ERROR_BY_CODE = new Map(AI_ERROR_GROUPS.flatMap((group) => group.codes.map((code) => [code, group])));
const AI_AUDIENCE = {
  test: '시험 연결 점검(test) · 시험 연결이며 실제 앱 권한 확인이 아닙니다',
  verified: '앱 권한 확인 후 점검(verified) · 점검 시각 기준 앱 권한 확인과 모델 응답입니다',
};
const AI_RECHECK = '다시 점검은 제공 화면의 「현재 API 연결 점검」 또는 「AI 연결 점검」 버튼을 직접 누르세요. 자동으로 다시 점검하지 않습니다.';
// 열쇠·인증 값처럼 보이는 글자가 섞인 message 는 화면에 쓰지 않습니다.
const SECRET_LIKE = /sk-[A-Za-z0-9]|bearer\s|api[_-]?key|token\s*[:=]|password\s*[:=]/iu;
const safeMessage = (message) => (typeof message === 'string' && /^[^\r\n]{1,300}$/u.test(message) && !SECRET_LIKE.test(message)
  ? message : '표시할 수 있는 안내 문구가 없습니다');

function aiErrorLines(error, what) {
  const code = safeCode(error && error.code);
  const group = AI_ERROR_BY_CODE.get(code);
  return [
    textNode('p', `${what} ${group && group.cause === '취소됨' ? '중단' : '실패'} · 원인: ${group ? group.cause : '확인 불가'} (code: ${code})`, 'state state-error'),
    textNode('p', `안내 문구: ${safeMessage(error && error.message)}`),
    textNode('p', group ? group.guide : 'AI 연결 또는 응답을 확인할 수 없습니다. 담당자에게 확인하세요.'),
  ];
}

// 18단계 renderExplanation: 설명에서만 오는 실패 원인입니다. 그 밖의 code 는 17단계 원인표로 안내합니다.
const EXPLAIN_ERROR = {
  ON_AI_INVALID_INPUT: { cause: '근거 부족(사건 근거·규칙 확인 불가)', guide: '이 기록의 근거나 규칙을 AI 설명에 쓸 수 있는 형식으로 확인하지 못해 설명을 만들 수 없습니다. 근거를 지어내 채우지 않습니다.' },
  ON_AI_INVALID_OUTPUT: { cause: 'AI 응답의 근거·조치·형식 불일치', guide: 'AI가 답한 근거 ID·조치·형식이 이 기록과 맞지 않아 설명을 쓰지 않았습니다. 필요하면 「AI 설명 요청」 버튼을 직접 다시 누르세요.' },
};
// 17단계 원인표의 안내는 연결 점검 기준이므로, 설명 요청에 맞지 않는 원인만 설명용 안내로 바꿉니다.
const EXPLAIN_RETRY = '필요하면 「AI 설명 요청」 버튼을 직접 다시 누르세요. 자동으로 다시 요청하지 않습니다.';
const EXPLAIN_GUIDE_BY_CAUSE = {
  '반 사용량 소진': '담당자에게 확인하세요. 다시 요청해도 바로 풀리지 않습니다.',
  '이용 한도 도달': '담당자에게 확인하세요. 다시 요청해도 바로 풀리지 않습니다.',
  '이용 시간 아님': `수업용 AI 이용 시간을 확인하세요. ${EXPLAIN_RETRY}`,
  '요청 제한': `잠시 뒤 다시 요청하세요. ${EXPLAIN_RETRY}`,
  '시간 초과': `응답이 제한 시간 안에 오지 않아 설명 요청이 끝났습니다. ${EXPLAIN_RETRY}`,
  '네트워크·서버 연결 문제': `연결 상태를 확인하세요. ${EXPLAIN_RETRY}`,
  '취소됨': '설명 요청을 취소했습니다. 이전 설명은 현재 결과가 아니므로 표시하지 않습니다.',
};
const STATE_KEYS = [['access', '접속'], ['session', '세션'], ['device', '기기']];

function explanationErrorLines(error) {
  const code = safeCode(error && error.code);
  const group = EXPLAIN_ERROR[code] || AI_ERROR_BY_CODE.get(code);
  const cancelled = group && group.cause === '취소됨';
  const guide = group ? EXPLAIN_GUIDE_BY_CAUSE[group.cause] || group.guide : 'AI 연결 또는 응답을 확인할 수 없습니다. 담당자에게 확인하세요.';
  return [
    textNode('p', `AI 설명 ${cancelled ? '중단' : '실패'}: ${safeMessage(error && error.message)}`, 'state state-error'),
    textNode('p', `원인: ${group ? group.cause : '확인 불가'} (code: ${code})`),
    textNode('p', guide),
  ];
}

const isIdList = (list) => Array.isArray(list) && list.length > 0 && list.every((id) => typeof id === 'string' && id !== '')
  && new Set(list).size === list.length;

// 제공 코드가 이미 검사했지만, 이 기록과 맞지 않는 설명은 화면에서도 쓰지 않습니다. 문제가 없으면 null 입니다.
function explanationProblem(data, event) {
  if (!data || typeof data !== 'object') return '응답 형식을 확인할 수 없습니다.';
  if (data.executed !== false) return `AI가 이미 실행했다고 답한 설명은 쓸 수 없습니다 (executed: ${String(data.executed)}).`;
  if (data.requiresHumanConfirmation !== true) return '사람 확인이 필요하다는 표시가 없는 설명은 쓸 수 없습니다.';
  if (typeof data.summary !== 'string' || data.summary.trim() === '') return 'AI 요약이 비어 있습니다.';
  const evidenceIds = new Set(Array.isArray(event.evidence) ? event.evidence.map((row) => row && row.id) : []);
  if (!isIdList(data.evidenceIds)) return '근거가 맞지 않음: 인용한 근거 ID가 없거나 중복됐습니다.';
  const unknownRef = data.evidenceIds.find((id) => !evidenceIds.has(id));
  if (unknownRef !== undefined) return `근거가 맞지 않음: 이 기록에 없는 근거 ID(${safeCode(unknownRef)})를 인용했습니다.`;
  if (data.evidenceIds.length !== evidenceIds.size) return '근거 부족: 이 기록의 근거를 모두 인용하지 않았습니다.';
  if (!Array.isArray(data.proposals)) return '조치 제안 형식을 확인할 수 없습니다.';
  const supported = Array.isArray(event.supportedActions) ? event.supportedActions : [];
  for (const proposal of data.proposals) {
    const p = proposal && typeof proposal === 'object' ? proposal : {};
    if (!supported.includes(p.action)) return `이 기록에서 지원하지 않는 조치(${safeCode(p.action)})를 제안했습니다.`;
    if (!isIdList(p.evidenceIds) || p.evidenceIds.some((id) => !evidenceIds.has(id))) return `근거가 맞지 않음: 조치 제안(${safeCode(p.action)})이 이 기록에 없는 근거를 인용했습니다.`;
    if (typeof p.reason !== 'string' || p.reason.trim() === '') return `조치 제안(${safeCode(p.action)})의 이유가 없습니다.`;
  }
  return null;
}

function idTextList(title, rows, emptyText) {
  const block = document.createElement('div');
  block.append(textNode('h4', title));
  if (rows.length === 0) {
    block.append(textNode('p', emptyText, 'muted'));
    return block;
  }
  const list = document.createElement('ul');
  for (const [id, text] of rows) list.append(textNode('li', `${valueOr(id)} — ${valueOr(text)}`));
  block.append(list);
  return block;
}

function unknownStates(state) {
  const current = state && typeof state === 'object' ? state : {};
  const block = document.createElement('div');
  block.append(textNode('h4', '확인 불가 상태'));
  const unknown = STATE_KEYS.filter(([key]) => current[key] === 'unknown');
  if (unknown.length === 0) {
    block.append(textNode('p', '없음 (접속·세션·기기 모두 연동 시스템이 값을 알려 줬습니다)', 'muted'));
    return block;
  }
  const list = document.createElement('ul');
  for (const [, name] of unknown) list.append(textNode('li', `${name}: 확인 불가(unknown)`, 'state state-empty'));
  block.append(list, textNode('p', '확인 불가는 정상이나 안전을 뜻하지 않습니다.', 'muted'));
  return block;
}

function proposalList(proposals, event, evidenceText) {
  const block = document.createElement('div');
  block.append(textNode('h4', '조치 제안'));
  if (proposals.length === 0) {
    const none = Array.isArray(event.supportedActions) && event.supportedActions.length === 0
      ? '연동 시스템이 지원하는 조치가 없어 제안이 없습니다(정상).'
      : 'AI가 이 기록에 대해 제안한 조치가 없습니다. 필요하면 근거를 보고 담당자와 판단하세요.';
    block.append(textNode('p', none, 'muted'));
    return block;
  }
  const list = document.createElement('ul');
  for (const p of proposals) {
    const item = textNode('li', `조치: ${valueOr(p.action)} · 이유: ${valueOr(p.reason)}`);
    item.append(
      textNode('p', `근거: ${p.evidenceIds.map((id) => `${id} — ${valueOr(evidenceText.get(id))}`).join(' / ')}`),
      textNode('p', '사람 확인이 필요하며 실행되지 않았습니다.', 'state state-empty'),
    );
    list.append(item);
  }
  block.append(list);
  return block;
}

function explanationBody(data, event, checkedAt) {
  const evidenceText = new Map(event.evidence.map((row) => [row.id, row.text]));
  const rules = Array.isArray(event.rules) ? event.rules.map((row) => [row && row.id, row && row.text]) : [];
  return [
    textNode('p', `사건 ID: ${event.id}`),
    textNode('h4', 'AI 설명(참고용)'),
    textNode('p', '아래 요약은 AI가 이 기록을 읽고 쓴 해석입니다. 사실 판단은 근거 글과 연동 시스템이 알려 준 현재 상태로 하세요.', 'muted'),
    textNode('p', data.summary),
    idTextList('인용한 근거', data.evidenceIds.map((id) => [id, evidenceText.get(id)]), '인용한 근거 없음'),
    idTextList('규칙', rules, '규칙 없음(빈 목록)'),
    unknownStates(event.state),
    proposalList(data.proposals, event, evidenceText),
    textNode('p', `설명 시각: ${formatCheckedAt(checkedAt)}`),
    textNode('p', 'AI 설명은 참고 정보이며, 설명·제안만으로 어떤 보안 조치도 실행되지 않았습니다.', 'muted'),
  ];
}

// 19단계 renderAction: 상태값별 표시 문구입니다. 화면에는 원래 값을 괄호로 함께 적습니다.
// 접수(ACK)·전달 중은 효과가 아니며, 효과 확인은 succeeded 이면서 effectApplied 가 true 일 때뿐입니다.
const ACTION_RECHECK = '결과는 제공 화면의 「원천 결과만 재조회」를 직접 눌러 다시 확인하세요. 자동으로 재조회하거나 다시 집행하지 않습니다.';
const ACTION_STATUS = {
  idle: { label: '아직 미실행(idle)', tone: 'empty' },
  prepared: { label: '준비됨·미실행(prepared) · 서버에 아직 전달하지 않았습니다', tone: 'empty' },
  executing: { label: '서버에 전달 중(executing) · 결과가 아직 없습니다. 완료 아님', tone: 'loading' },
  pending: { label: '서버 접수·처리 중(pending) · 서버가 요청을 받았다는 응답(ACK)이며, 효과는 아직 확인되지 않았습니다. 완료 아님', tone: 'loading' },
  succeeded: { label: '효과 확인(succeeded)', tone: 'ok' },
  denied: { label: '거절(denied) · 연동 시스템이 이 조치를 거절했습니다', tone: 'error' },
  failed: { label: '실패(failed) · 연동 시스템이 조치를 처리하지 못했습니다', tone: 'error' },
  unknown: { label: '결과 불명(unknown) · 효과 없음으로도 성공으로도 판단하지 마세요', tone: 'empty' },
  expired: { label: '확인 기한 지남(expired) · 이번 준비로는 집행할 수 없습니다', tone: 'error' },
  error: { label: '요청 처리 안 됨(error)', tone: 'error' },
};

const effectConfirmed = (s) => s.status === 'succeeded' && s.observation && typeof s.observation === 'object'
  && s.observation.effectApplied === true && typeof s.observation.observedAt === 'string' && Number.isFinite(Date.parse(s.observation.observedAt));

// 받은 영수증이 현재 사건·조치의 것인지 봅니다. 맞지 않으면 그 까닭을, 맞으면 null 을 돌려줍니다.
function actionMismatch(event, actionId, receipt) {
  if (!receipt) return null;
  if (receipt.eventId !== undefined && (!event || receipt.eventId !== event.id)) return '받은 결과의 사건 ID가 현재 사건과 다릅니다.';
  if (receipt.actionId !== undefined && receipt.actionId !== actionId) return '받은 결과의 조치 ID가 현재 조치와 다릅니다.';
  return null;
}

function actionStatusLine(s) {
  if (s.status === 'succeeded' && !effectConfirmed(s)) {
    return { text: '결과 불명(unknown) · succeeded 를 받았지만 연동 시스템의 효과 관측(effectApplied: true)이 없어 효과 확인으로 표시하지 않습니다', tone: 'empty' };
  }
  if (s.status === 'loading') {
    return { text: s.receipt ? '연동 시스템 결과 조회 중(loading) · 아직 결과를 받지 않았습니다' : '조치 준비 중(loading) · 미실행', tone: 'loading' };
  }
  if (!Object.hasOwn(ACTION_STATUS, s.status)) return { text: `결과 불명 · 알 수 없는 상태값(${valueOr(s.status)})입니다. 성공으로 간주하지 마세요`, tone: 'empty' };
  const entry = ACTION_STATUS[s.status];
  return { text: entry.label, tone: entry.tone };
}

function actionStatusGuide(status, s) {
  const lines = [];
  const message = typeof s.message === 'string' && s.message.trim() !== '' ? safeMessage(s.message) : null;
  if (status === 'idle') {
    lines.push(textNode('p', '조치 준비는 AI 설명의 조치 제안에 있는 「… 조치 준비」 버튼에서 시작합니다. 지금 기록처럼 연동 시스템이 지원하는 조치가 없으면(supportedActions 빈 목록) 조치 준비 버튼이 나오지 않으며, 이것이 정상입니다.'));
    if (message) lines.push(textNode('p', `안내: ${message}`, 'muted'));
  } else if (status === 'prepared') {
    lines.push(
      textNode('p', `사람 확인 기한: ${formatCheckedAt(s.confirmationExpiresAt)}`),
      textNode('p', '아래 실제 대상과 조치를 읽은 뒤, 제공 화면의 「대상과 조치를 확인했으며 집행합니다」를 직접 눌러야 서버에 전달됩니다. 누르기 전에는 아무것도 실행되지 않습니다.'),
    );
  } else if (status === 'executing' || status === 'pending') {
    lines.push(textNode('p', `효과가 확인되기 전입니다. ${status === 'pending' ? ACTION_RECHECK : '서버 응답을 기다리는 중입니다.'}`));
  } else if (status === 'succeeded' && effectConfirmed(s)) {
    lines.push(
      textNode('p', `관측 시각: ${formatCheckedAt(s.observation.observedAt)}`),
      textNode('p', 'effectApplied: true · 연동 시스템이 효과를 관측했습니다.'),
    );
  } else if (status === 'denied' || status === 'failed') {
    lines.push(textNode('p', `연동 시스템 메시지: ${message || '없음'}`));
  } else if (status === 'expired') {
    lines.push(textNode('p', 'AI 설명의 조치 제안에서 「… 조치 준비」를 다시 눌러 새로 준비하고, 실제 대상과 확인 기한을 다시 확인하세요.'));
  } else if (status === 'error') {
    const error = s.error && typeof s.error === 'object' ? s.error : {};
    lines.push(textNode('p', `code: ${safeCode(error.code)} · ${safeMessage(error.message)}`, 'state state-error'));
  }
  if (status === 'unknown' || (s.status === 'succeeded' && !effectConfirmed(s))) {
    lines.push(textNode('p', `이미 서버에 전달됐을 수 있으므로 다시 집행하지 마세요. ${ACTION_RECHECK}`));
    if (s.error && typeof s.error === 'object') lines.push(textNode('p', `code: ${safeCode(s.error.code)} · ${safeMessage(s.error.message)}`));
  }
  return lines;
}

// 받은 범위의 식별자만 글자로 적습니다. 없는 값은 만들지 않습니다.
function actionIdentifiers(event, s, receipt) {
  const rows = [];
  if (event) {
    rows.push(`사건 ID: ${event.id}`);
    const evidence = Array.isArray(event.evidence) ? event.evidence.map((row) => row && row.id).filter((id) => typeof id === 'string') : [];
    if (evidence.length > 0) rows.push(`근거 ID: ${evidence.join(', ')}`);
  }
  if (typeof s.actionId === 'string' && s.actionId !== '') rows.push(`조치 ID(actionId): ${s.actionId}`);
  if (s.target && typeof s.target === 'object') rows.push(`실제 대상(target.id): ${valueOr(s.target.id)} · 세대(target.generation): ${Number.isSafeInteger(s.target.generation) ? s.target.generation : '확인 불가'}`);
  if (receipt) {
    if (typeof receipt.requestId === 'string') rows.push(`요청 ID(requestId): ${receipt.requestId}`);
    if (typeof receipt.receiptId === 'string') rows.push(`접수 ID(receiptId): ${receipt.receiptId}`);
    if (Number.isSafeInteger(receipt.version)) rows.push(`버전(version): ${receipt.version}`);
    if (receipt.replayed === true) rows.push('replayed: true · 이미 접수된 같은 요청의 기존 결과이며, 새로 집행하지 않았습니다.');
    if (receipt.superseded === true) rows.push('superseded: true · 이전 조회는 최신 결과를 대신하지 않습니다.');
  }
  if (rows.length === 0) return [];
  const list = document.createElement('ul');
  for (const row of rows) list.append(textNode('li', row));
  return [textNode('h4', '현재 조치 식별 정보'), list];
}

// 20단계 renderVulnerabilities: 전체 조회 상태(data.status)와 패키지별 상태 문구입니다. 원래 값은 괄호로 함께 적습니다.
// 미조회·조회 실패·확인 불가는 "취약점 없음"이 아닙니다.
const VULN_RECHECK = '조회는 보호 현황의 「설치 패키지 조회」를 직접 눌러 실행합니다. 자동으로 다시 조회하지 않습니다.';
const VULN_CANCEL_CODES = new Set(['CANCELLED', 'REQUEST_CANCELLED']);
const SCAN_STATUS = {
  complete: { label: '모두 조회(complete)', note: '조회 대상 패키지를 모두 OSV에 조회했습니다.', tone: 'ok' },
  partial: { label: '일부 조회 실패(partial)', note: '일부 패키지는 조회를 확인할 수 없었습니다. 이미 받은 취약점 ID는 지우지 않고 그대로 표시합니다.', tone: 'error' },
  not_checked: { label: '아직 조회 안 함(not_checked)', note: '승인된 공개 조회 대상 패키지가 없어 OSV에 조회하지 않았습니다. "취약점 없음"이 아닙니다.', tone: 'empty' },
  not_configured: { label: '조회 준비 미완료(not_configured)', note: '조회 대상 프로젝트 설정이 필요합니다. 대상 경로와 허용 패키지는 운영자가 준비하며, "취약점 없음"이 아닙니다.', tone: 'empty' },
  unverifiable: { label: 'lock 파일 확인 불가(unverifiable)', note: 'package-lock.json과 설치된 node_modules 메타데이터를 대조할 수 없어 조회하지 않았습니다. "취약점 없음"이 아닙니다.', tone: 'empty' },
};
// 정확한 설치 버전(semver)만 버전으로 씁니다. ^1.2.0 같은 범위는 설치 버전으로 표시하지 않습니다.
const EXACT_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const isExactVersion = (value) => typeof value === 'string' && EXACT_VERSION.test(value);

function packageStatusText(row, findings) {
  if (row.status === 'known_vulnerabilities') return { text: `알려진 항목 있음(known_vulnerabilities) · ${findings.length}건`, tone: 'error' };
  if (row.status === 'none_found') return { text: '알려진 항목 없음(none_found) · 이 버전에 대해 OSV 조회 범위에서 알려진 항목이 없다는 뜻이며, 안전을 보장하지 않습니다', tone: 'ok' };
  if (row.status === 'unverifiable') {
    return findings.length > 0
      ? { text: `일부 확인·전체 조회 확인 불가(unverifiable) · 받은 취약점 ${findings.length}건은 그대로 표시합니다`, tone: 'error' }
      : { text: '조회 확인 불가(unverifiable) · "취약점 없음"이 아닙니다', tone: 'empty' };
  }
  return { text: `확인 불가 (알 수 없는 값: ${valueOr(row.status)}) · "취약점 없음"으로 간주하지 마세요`, tone: 'empty' };
}

function scanSummary(data) {
  const entry = Object.hasOwn(SCAN_STATUS, data.status) ? SCAN_STATUS[data.status] : null;
  const nodes = [entry
    ? textNode('p', `전체 조회 상태: ${entry.label} · ${entry.note}`, `state state-${entry.tone}`)
    : textNode('p', `전체 조회 상태: 확인 불가 (알 수 없는 값: ${valueOr(data.status)}) · "취약점 없음"으로 간주하지 마세요.`, 'state state-empty')];
  const rows = [];
  if (typeof data.code === 'string') rows.push(`상태 코드(code): ${safeCode(data.code)}`);
  if (Number.isInteger(data.lockfileVersion)) rows.push(`lockfileVersion: ${data.lockfileVersion}`);
  if (typeof data.lockfileHash === 'string') rows.push(`lockfileHash: ${valueOr(data.lockfileHash)}`);
  if (data.checkedAt !== undefined) rows.push(`조회 시각(checkedAt): ${formatCheckedAt(data.checkedAt)}`);
  if (data.excluded && Number.isInteger(data.excluded.count)) rows.push(`조회에서 제외한 패키지(비공개·미승인 등, 밖으로 보내지 않음): ${data.excluded.count}개`);
  if (rows.length > 0) {
    const list = document.createElement('ul');
    for (const row of rows) list.append(textNode('li', row));
    nodes.push(list);
  }
  if (data.status === 'complete' || data.status === 'partial') {
    nodes.push(textNode('p', '전체 결과는 package-lock.json과 설치된 node_modules의 메타데이터를 대조한 값입니다. 버전은 버전 범위가 아니라 설치된 정확한 버전입니다.', 'muted'));
  }
  return nodes;
}

function packageList(data) {
  const block = document.createElement('div');
  if (data.status !== 'complete' && data.status !== 'partial') return block;
  block.append(textNode('h4', '패키지별 조회 결과'));
  const packages = Array.isArray(data.packages) ? data.packages : [];
  if (packages.length === 0) {
    block.append(textNode('p', '조회 대상 패키지가 0개입니다. "취약점 없음"이 아닙니다.', 'state state-empty'));
    return block;
  }
  const list = document.createElement('ul');
  list.className = 'student-package-list';
  for (const item of packages) {
    const row = item && typeof item === 'object' ? item : {};
    const findings = Array.isArray(row.vulnerabilities) ? row.vulnerabilities.filter((v) => v && typeof v === 'object') : [];
    const exact = isExactVersion(row.version);
    const li = document.createElement('li');
    li.setAttribute('data-student-package-name', valueOr(row.name));
    if (exact) li.setAttribute('data-student-package-version', row.version);
    const status = packageStatusText(row, findings);
    li.append(
      textNode('p', `${valueOr(row.name)} · 설치 버전: ${exact ? row.version : `확인 불가 (정확한 설치 버전이 아님: ${valueOr(row.version)})`}`),
      textNode('p', `상태: ${status.text}`, `state state-${status.tone}`),
      textNode('p', `출처(source): ${valueOr(row.source)} · 조회 시각(checkedAt): ${formatCheckedAt(row.checkedAt)}`),
    );
    if (findings.length > 0) {
      const vulns = document.createElement('ul');
      for (const finding of findings) vulns.append(textNode('li', `취약점 ID: ${valueOr(finding.id)} · 수정 시각(modified): ${formatCheckedAt(finding.modified)}`));
      li.append(vulns);
    }
    list.append(li);
  }
  block.append(list);
  return block;
}

// 총공세 1순위 A: 관제 대시보드형 상태 카드 네 개(연결·기기·세션·알림)와 이번 실행의 추이입니다.
// 카드는 제공 화면이 넘긴 현재 값만 씁니다. 실측(이 PC)·예제 자료(demo)·아직 값 없음을 글자로 구분하고,
// 연결 없음·조회 실패·확인 불가를 0건이나 정상으로 바꾸지 않습니다.
const CONNECTION_CARD = {
  connected: { text: '연결됨(connected)', tone: 'ok' },
  demo: { text: '예제 자료(demo) · 실제 연결 아님', tone: 'empty' },
  disconnected: { text: '연결 없음(disconnected)', tone: 'error' },
  unknown: { text: '확인 불가(unknown)', tone: 'empty' },
};
// 제공 style.css 에 대시보드용 규칙이 없으므로, 제공 색 변수만 써서 학생 요소에 배치를 직접 지정합니다.
const styled = (node, styles) => { Object.assign(node.style, styles); return node; };
const TONE_COLOR = { ok: 'var(--allow)', error: 'var(--deny)', loading: 'var(--muted)', empty: 'var(--unknown)' };
const RELOAD_RESOURCES = new Set(['me', 'apps', 'events', 'devices', 'sessions']);
const isSettled = (resource) => resource && (resource.status === 'ok' || resource.status === 'error');
const pad2 = (n) => String(n).padStart(2, '0');
const clockText = (date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;

function listSummary(resource, table, unit) {
  const current = resource && typeof resource === 'object' ? resource : { status: null };
  if (current.status === 'loading') return { text: '불러오는 중', tone: 'loading' };
  if (current.status === 'error') return { text: `조회 실패 (${safeCode(current.error && current.error.code)})`, tone: 'error' };
  if (current.status !== 'ok' || !Array.isArray(current.data)) return { text: '확인 불가', tone: 'empty' };
  if (current.data.length === 0) return { text: `0${unit} (조회 성공, 등록 없음)`, tone: 'empty' };
  const counts = new Map();
  for (const row of current.data) {
    const key = Object.hasOwn(table, row && row.status) ? row.status : 'unknown';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const parts = [...counts].map(([key, n]) => `${Object.hasOwn(table, key) ? table[key].label : '확인 불가'} ${n}`);
  const allOk = counts.size === 1 && table[[...counts.keys()][0]].tone === 'ok';
  return { text: `${current.data.length}${unit} · ${parts.join(' · ')}`, tone: allOk ? 'ok' : 'empty' };
}

function alertSummary(notifications) {
  if (!Array.isArray(notifications)) return { text: '확인 불가', tone: 'empty' };
  let failed = 0;
  let attention = 0;
  for (const item of notifications) {
    if (ATTENTION_CODES.has(safeCode(item && item.code))) attention += 1;
    else failed += 1;
  }
  if (failed === 0 && attention === 0) return { text: '주의할 알림 없음', tone: 'ok' };
  return { text: `조회 실패 ${failed}건 · 주의 ${attention}건`, tone: failed > 0 ? 'error' : 'empty' };
}

// 「다시 불러오기」 한 번을 한 줄로 쌓습니다. 기기·세션이 불러오는 중이 되면 새 줄을 열고, 응답이 끝나는 동안 그 줄만 갱신합니다.
// 다시 불러오기는 자료를 하나씩 초기화하므로, 같은 주기에서는 늘기만 하는 알림 수가 줄면 초기화가 시작된 것으로 보고
// 이전 줄을 굳힌 채 기기·세션이 다시 불러오는 중이 될 때까지 기록하지 않습니다. 브라우저 메모리에만 있어 새로고침하면 사라집니다.
function createStatusHistory(limit = 10) {
  const entries = [];
  let startNew = true;
  let resetting = false;
  let lastAlerts = -1;
  return {
    observe(summary, settled, alertTotal) {
      if (!settled) { startNew = true; resetting = false; lastAlerts = -1; return null; }
      if (resetting || (!startNew && alertTotal < lastAlerts)) { resetting = true; return null; }
      lastAlerts = alertTotal;
      if (startNew || entries.length === 0) {
        entries.unshift({ at: new Date(), ...summary });
        if (entries.length > limit) entries.pop();
        startNew = false;
      } else {
        Object.assign(entries[0], summary);
      }
      return entries[0];
    },
    list: () => entries,
  };
}

function valueKind(settled, mode, at) {
  if (!settled || !at) return { text: '아직 값 없음', className: 'muted' };
  if (mode === 'demo') return { text: '예제 자료(demo) · 실제 값 아님', className: 'tag tag-demo' };
  return { text: `실측 · 이 PC · ${clockText(at)}`, className: 'tag' };
}

function statusCard(title, summary, kind) {
  const card = styled(document.createElement('li'), {
    display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px',
    border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface)',
  });
  card.className = 'student-dashboard-card';
  card.append(
    styled(textNode('h4', title), { margin: '0', fontSize: '0.8rem', color: 'var(--muted)' }),
    styled(textNode('p', summary.text, `state state-${summary.tone}`), { fontWeight: '600', overflowWrap: 'anywhere' }),
    styled(textNode('p', kind.text, kind.className), { margin: '0', alignSelf: 'flex-start', fontSize: '0.75rem' }),
  );
  return card;
}

function statusDashboard({ devices, sessions, notifications, mode }, history) {
  const settled = isSettled(devices) && isSettled(sessions);
  const connection = Object.hasOwn(CONNECTION_CARD, mode) ? CONNECTION_CARD[mode] : CONNECTION_CARD.unknown;
  const summary = {
    mode: valueOr(mode),
    connection: connection.text,
    devices: listSummary(devices, DEVICE_STATUS, '대'),
    sessions: listSummary(sessions, SESSION_STATUS, '개'),
    // 기기·세션 응답이 끝나기 전의 빈 알림 목록은 "알림 없음"이 아니라 아직 값이 없는 상태입니다.
    alerts: settled ? alertSummary(notifications) : { text: '불러오는 중', tone: 'loading' },
  };
  // 초기화 감지에는 「다시 불러오기」로 함께 초기화되는 다섯 자료의 알림만 셉니다(도움정보·판정·패키지 조회는 따로 바뀜).
  const reloadAlerts = Array.isArray(notifications) ? notifications.filter((n) => n && RELOAD_RESOURCES.has(n.resource)).length : 0;
  const entry = history.observe(summary, settled, reloadAlerts);
  const kind = valueKind(settled, mode, entry && entry.at);

  const section = document.createElement('section');
  section.className = 'student-dashboard';
  section.setAttribute('aria-label', '상태 요약');
  section.append(textNode('h3', '상태 요약'));
  const cards = styled(document.createElement('ul'), {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px',
    listStyle: 'none', padding: '0', margin: '8px 0',
  });
  cards.className = 'student-dashboard-cards';
  cards.append(
    statusCard('연결', { text: connection.text, tone: connection.tone }, kind),
    statusCard('기기', summary.devices, kind),
    statusCard('세션', summary.sessions, kind),
    statusCard('알림', summary.alerts, kind),
  );
  section.append(
    cards,
    textNode('p', '실측은 이 PC의 앱이 방금 받은 결과이며, 조회 실패도 실측 결과입니다. 예제 자료(demo)는 실제 값이 아닙니다. 연결 없음·조회 실패·확인 불가는 0건이나 정상이 아닙니다.', 'muted'),
    historyTable(history.list()),
  );
  return section;
}

function historyTable(entries) {
  const block = document.createElement('div');
  block.append(textNode('h4', '추이: 이번 실행의 확인 기록'));
  if (entries.length === 0) {
    block.append(textNode('p', '아직 기록이 없습니다. 기기·세션 응답이 끝나면 첫 줄이 생깁니다.', 'muted'));
    return block;
  }
  const cellStyle = { padding: '6px 8px', borderBottom: '1px solid var(--border)', textAlign: 'left', verticalAlign: 'top', overflowWrap: 'anywhere' };
  const table = styled(document.createElement('table'), { width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' });
  table.className = 'student-dashboard-history';
  table.append(styled(textNode('caption', `최근 ${entries.length}건 · 맨 위 줄이 현재 결과, 아래 줄은 과거 확인입니다`),
    { textAlign: 'left', padding: '4px 0', color: 'var(--muted)' }));
  const head = document.createElement('tr');
  for (const name of ['확인 시각(이 PC)', '구분', '연결', '기기', '세션', '알림', '값 종류']) {
    const th = styled(textNode('th', name), { ...cellStyle, background: 'var(--unknown-soft)', whiteSpace: 'nowrap' });
    th.scope = 'col';
    head.append(th);
  }
  const thead = document.createElement('thead');
  thead.append(head);
  const tbody = document.createElement('tbody');
  entries.forEach((entry, index) => {
    const current = index === 0;
    const row = styled(document.createElement('tr'), current ? { background: 'var(--accent-soft)', fontWeight: '600' } : { color: 'var(--muted)' });
    const cells = [
      [clockText(entry.at), null], [current ? '현재' : '과거 확인', null], [entry.connection, null],
      [entry.devices.text, entry.devices.tone], [entry.sessions.text, entry.sessions.tone], [entry.alerts.text, entry.alerts.tone],
      [entry.mode === 'demo' ? '예제 자료(demo)' : '실측', null],
    ];
    for (const [text, tone] of cells) {
      const td = styled(textNode('td', text), cellStyle);
      if (current && tone) td.style.color = TONE_COLOR[tone];
      row.append(td);
    }
    tbody.append(row);
  });
  table.append(thead, tbody);
  const scroller = styled(document.createElement('div'), { overflowX: 'auto' });
  scroller.append(table);
  block.append(scroller, textNode('p', '「다시 불러오기」를 누를 때마다 한 줄씩 쌓입니다(최대 10줄). 브라우저 메모리에만 있으므로 새로고침하면 사라지며, 파일이나 서버에 저장하지 않습니다.', 'muted'));
  return block;
}

// 총공세 2순위 D: 설치 패키지 조회 요약 카드 네 개(전체 조회 상태·조회한 패키지 수·알려진 취약점 수·조회 시각)입니다.
// 미조회·조회 실패·설정 필요는 "조회 안 됨"으로 두고 0개·0건으로 바꾸지 않습니다.
const NOT_SCANNED = { text: '조회 안 됨', tone: 'empty' };
const dateTimeText = (value) => {
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${clockText(d)}`;
};

function vulnerabilityCards({ status, mode, data, error }) {
  const scanned = status === 'ok' && data && typeof data === 'object' && (data.status === 'complete' || data.status === 'partial');
  const packages = scanned && Array.isArray(data.packages) ? data.packages : [];
  let overall;
  if (status === 'idle') overall = { text: '조회 전', tone: 'empty' };
  else if (status === 'loading') overall = { text: '조회 중', tone: 'loading' };
  else if (status === 'error') overall = { text: `조회 실패 (${safeCode(error && error.code)})`, tone: 'error' };
  else if (status === 'ok' && data && Object.hasOwn(SCAN_STATUS, data.status)) overall = { text: SCAN_STATUS[data.status].label, tone: SCAN_STATUS[data.status].tone };
  else overall = { text: '확인 불가', tone: 'empty' };

  let packageCount = NOT_SCANNED;
  let findingCount = NOT_SCANNED;
  if (scanned) {
    const unverifiable = packages.filter((row) => row && row.status === 'unverifiable').length;
    const findings = packages.reduce((sum, row) => sum + (row && Array.isArray(row.vulnerabilities) ? row.vulnerabilities.length : 0), 0);
    const affected = packages.filter((row) => row && Array.isArray(row.vulnerabilities) && row.vulnerabilities.length > 0).length;
    packageCount = { text: `${packages.length}개${unverifiable > 0 ? ` · 조회 확인 불가 ${unverifiable}개 포함` : ''}`, tone: unverifiable > 0 ? 'error' : 'ok' };
    if (data.status === 'partial') findingCount = { text: `확인된 것 ${findings}건 이상 · 일부 패키지 확인 불가`, tone: 'error' };
    else if (findings > 0) findingCount = { text: `${findings}건 · 패키지 ${affected}개`, tone: 'error' };
    else findingCount = { text: '0건 · OSV 조회 범위에서 알려진 항목 없음(안전 보장 아님)', tone: 'ok' };
  }
  const at = status === 'ok' && data ? dateTimeText(data.checkedAt) : null;
  const checked = at ? { text: at, tone: 'empty' } : { text: '없음', tone: 'empty' };

  let kind;
  if (status === 'ok' && at) kind = mode === 'demo'
    ? { text: '예제 자료(demo) · 실제 값 아님', className: 'tag tag-demo' }
    : { text: `실측 · 이 PC · ${at.slice(11)}`, className: 'tag' };
  else if (status === 'error') kind = { text: '실측 · 이 PC · 조회 실패(결과 값 없음)', className: 'tag' };
  else kind = { text: '아직 값 없음', className: 'muted' };

  const section = document.createElement('section');
  section.className = 'student-dashboard';
  section.setAttribute('aria-label', '설치 패키지 조회 요약');
  section.append(textNode('h4', '조회 요약'));
  const cards = styled(document.createElement('ul'), {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px',
    listStyle: 'none', padding: '0', margin: '8px 0',
  });
  cards.className = 'student-dashboard-cards';
  cards.append(
    statusCard('전체 조회 상태', overall, kind),
    statusCard('조회한 패키지 수', packageCount, kind),
    statusCard('알려진 취약점 수', findingCount, kind),
    statusCard('조회 시각', checked, kind),
  );
  section.append(cards, textNode('p', '"조회 안 됨"은 0개·0건이 아닙니다. 패키지 수와 취약점 수는 모두 조회(complete)나 일부 조회 실패(partial)일 때만 셉니다.', 'muted'));
  return section;
}

export function createStudentView() {
  const statusHistory = createStatusHistory();
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
    // 호출될 때마다 현재 입력으로 새 요소를 만듭니다. 다시 불러와 성공하면 이전 실패 안내는 남지 않습니다.
    // 맨 위 상태 카드는 현재 값만, 추이 표는 이번 실행의 과거 확인을 "과거 확인"으로 구분해 보여 줍니다.
    renderStatus({ devices, sessions, notifications, diagnostics, mode } = {}) {
      const root = document.createElement('div');
      root.className = 'student-status';
      if (Object.hasOwn(MODE_NOTICE, mode)) {
        root.append(textNode('p', MODE_NOTICE[mode], mode === 'demo' ? 'tag tag-demo' : 'tag'));
      }
      root.append(
        statusDashboard({ devices, sessions, notifications, mode }, statusHistory),
        notificationList(notifications),
        statusResource('기기', '기기 목록', devices, '등록된 기기가 없음: 조회는 성공했고 내 이름으로 등록된 기기가 0개입니다.', deviceRow),
        statusResource('세션', '현재 세션', sessions, '현재 연결 없음: 조회는 성공했고 지금 검증된 연결이 없습니다.', sessionRow),
        textNode('p', '세션은 지금 검증된 연결 하나만 표시합니다. 지난 세션 목록이 아닙니다.', 'muted'),
        diagnosticsSection(diagnostics),
      );
      return root;
    },
    // 호출될 때마다 현재 입력으로 새 요소를 만듭니다. 조회 중·오류·다시 조회로 새 값이 오면 이전 표는 남지 않습니다.
    renderVulnerabilities({ status, mode, data, error } = {}) {
      const root = document.createElement('div');
      root.className = 'student-vulnerabilities';
      root.append(textNode('h3', '설치 패키지와 알려진 취약점(OSV)'));
      if (Object.hasOwn(MODE_NOTICE, mode)) {
        root.append(textNode('p', MODE_NOTICE[mode], mode === 'demo' ? 'tag tag-demo' : 'tag'));
      }
      root.append(vulnerabilityCards({ status, mode, data, error }));
      if (status === 'idle') {
        root.append(textNode('p', `조회 전: 아직 설치 패키지를 조회하지 않았습니다. ${VULN_RECHECK}`, 'state state-empty'));
      } else if (status === 'loading') {
        root.append(textNode('p', '조회 중… 아직 결과를 받지 않았습니다. 이전 조회 결과는 현재 결과가 아니므로 표시하지 않습니다.', 'state state-loading'));
      } else if (status === 'error') {
        const code = safeCode(error && error.code);
        const cancelled = VULN_CANCEL_CODES.has(code);
        root.append(
          textNode('p', `${cancelled ? '조회 취소' : '조회 실패'}: ${safeMessage(error && error.message)} (code: ${code})`, 'state state-error'),
          textNode('p', `조회 실패·취소는 "취약점 없음"이 아닙니다. 이전 결과는 현재 결과가 아니므로 표시하지 않습니다. ${VULN_RECHECK}`),
        );
      } else if (status === 'ok' && data && typeof data === 'object') {
        root.append(...scanSummary(data), packageList(data));
      } else {
        root.append(textNode('p', '확인 불가: 알 수 없는 조회 상태입니다. "취약점 없음"으로 간주하지 마세요.', 'state state-empty'));
      }
      root.append(textNode('p', 'OSV는 알려진 취약점 데이터베이스입니다. 조회 결과가 없다는 사실만으로 해당 패키지나 앱 전체가 안전하다고 보장할 수 없습니다.', 'muted'));
      return root;
    },
    // 현재 점검 결과 하나만 새 요소로 그립니다. 재점검 성공·취소·idle 로 다시 호출되면 이전 결과와 오류 안내는 남지 않습니다.
    renderAiConnection({ status, mode, data, error, checkedAt, explanationAccepted } = {}) {
      const root = document.createElement('div');
      root.className = 'student-ai-connection';
      root.append(textNode('h3', 'AI 연결 점검 결과'));
      if (Object.hasOwn(MODE_NOTICE, mode)) {
        root.append(textNode('p', MODE_NOTICE[mode], mode === 'demo' ? 'tag tag-demo' : 'tag'));
      }
      if (status === 'idle') {
        root.append(textNode('p', 'AI 연결 점검 전: 아직 점검하지 않았습니다. 이전 점검 결과는 표시하지 않습니다.', 'state state-empty'));
      } else if (status === 'loading') {
        root.append(textNode('p', 'AI 연결 점검 중… 아직 결과가 없습니다. 멈추려면 「AI 연결 점검 취소」를 누르세요.', 'state state-loading'));
      } else if (status === 'error') {
        root.append(...aiErrorLines(error, 'AI 연결 점검'));
      } else if (status === 'ok') {
        const record = data && typeof data === 'object' ? data : {};
        const audience = Object.hasOwn(AI_AUDIENCE, record.audienceAuthorization)
          ? AI_AUDIENCE[record.audienceAuthorization]
          : `확인 불가 (알 수 없는 값: ${valueOr(record.audienceAuthorization)})`;
        const count = Number.isInteger(record.modelCount) && record.modelCount >= 0 ? `${record.modelCount}개` : '확인 불가';
        root.append(
          textNode('p', `연결 점검 결과: ${audience}`, record.audienceAuthorization === 'verified' ? 'state state-ok' : 'state state-empty'),
          textNode('p', `응답 모델 수: ${count}`),
          textNode('p', `점검 시각: ${formatCheckedAt(checkedAt)}`),
        );
      } else {
        root.append(textNode('p', '확인 불가: 알 수 없는 점검 상태입니다. 연결 성공으로 간주하지 마세요.', 'state state-empty'));
      }
      // 이 칸의 결과는 모델 목록 응답 점검까지입니다. 사건 설명 실행 여부와는 별개입니다.
      if (explanationAccepted !== true) {
        root.append(textNode('p', '이 점검은 앱 서버를 거친 AI 연결과 모델 목록 응답만 확인합니다. 사건 설명은 아직 실행하지 않았습니다. 사건 설명은 보안 기록에서 따로 요청하고 확인합니다.', 'muted'));
      }
      root.append(textNode('p', AI_RECHECK, 'muted'));
      return root;
    },
    // 호출될 때마다 새 요소를 만듭니다. 다른 기록 선택·다시 불러오기·실패로 다시 호출되면 이전 설명과 성공 속성은 남지 않습니다.
    // data-student-explanation-event 는 이 기록의 근거와 맞는 성공한 설명에만 붙입니다. 실행 버튼은 만들지 않습니다.
    renderExplanation({ event, explanation, checkedAt } = {}) {
      const root = document.createElement('div');
      root.className = 'student-explanation';
      root.append(textNode('h3', 'AI 사건 설명'));
      const current = explanation && typeof explanation === 'object' ? explanation : { status: null };
      const record = event && typeof event === 'object' && typeof event.id === 'string' && event.id !== '' ? event : null;
      if (Object.hasOwn(MODE_NOTICE, current.mode)) {
        root.append(textNode('p', MODE_NOTICE[current.mode], current.mode === 'demo' ? 'tag tag-demo' : 'tag'));
      }
      if (current.status === 'error') {
        // 근거 부족이면 제공 코드가 event 를 null 로 넘기므로, 기록 선택 안내보다 실패 이유를 먼저 보여 줍니다.
        if (record) root.append(textNode('p', `사건 ID: ${record.id}`));
        root.append(
          ...explanationErrorLines(current.error),
          textNode('p', '기록은 그대로입니다. AI 설명 실패는 보안 기록과 업무 앱 판정에 영향을 주지 않으며, 과제 실패로 처리되지 않습니다.', 'muted'),
        );
      } else if (!record) {
        root.append(textNode('p', '보안 기록에서 기록을 먼저 고르세요. 아직 설명할 기록이 선택되지 않았습니다.', 'state state-empty'));
      } else if (current.status === 'loading') {
        root.append(textNode('p', `AI 설명 요청 중… (사건 ID ${record.id}) 아직 설명을 받지 않았습니다.`, 'state state-loading'));
      } else if (current.status === 'ok') {
        const problem = explanationProblem(current.data, record);
        if (problem) {
          root.append(
            textNode('p', `사건 ID: ${record.id}`),
            textNode('p', `AI 설명을 쓸 수 없음: ${problem}`, 'state state-error'),
            textNode('p', '설명 내용은 표시하지 않습니다. 없는 근거를 만들어 맞추지 않습니다. 기록은 그대로입니다.', 'muted'),
          );
          if (current.error && SAFE_CODE.test(String(current.error.code))) root.append(textNode('p', `code: ${current.error.code}`));
        } else {
          root.setAttribute('data-student-explanation-event', record.id);
          root.append(...explanationBody(current.data, record, checkedAt));
        }
      } else {
        root.append(textNode('p', `사건 ID: ${record.id} · 확인 불가: 사건 설명의 상태를 알 수 없습니다. 설명이 성공한 것으로 간주하지 마세요.`, 'state state-empty'));
      }
      return root;
    },
    // 호출될 때마다 현재 입력으로 새 요소를 만듭니다. 다시 준비·재조회·취소·다시 불러오기로 새 값이 오면 이전 대상·요청·결과는 남지 않습니다.
    // 버튼·요청·확인 티켓은 만들지 않으며, 조치는 제공 화면 버튼으로만 진행합니다.
    renderAction(input = {}) {
      const s = input && typeof input === 'object' ? input : {};
      const root = document.createElement('div');
      root.className = 'student-action';
      root.append(textNode('h3', '보안 조치 상태'));
      const event = s.event && typeof s.event === 'object' && typeof s.event.id === 'string' && s.event.id !== '' ? s.event : null;
      const receipt = s.receipt && typeof s.receipt === 'object' ? s.receipt : null;
      const mismatch = actionMismatch(event, s.actionId, receipt);
      const status = mismatch ? 'unknown' : s.status;
      const line = mismatch
        ? { text: `결과 불명(unknown) · ${mismatch} 이 결과를 성공이나 효과 없음으로 판단하지 마세요.`, tone: 'empty' }
        : actionStatusLine(s);
      root.append(textNode('p', line.text, `state state-${line.tone}`));
      root.append(...actionStatusGuide(status, s));
      if (event) root.setAttribute('data-student-action-event', event.id);
      if (!mismatch && receipt && typeof receipt.requestId === 'string' && receipt.requestId !== '') {
        root.setAttribute('data-student-action-request', receipt.requestId);
      }
      // 현재 사건·조치와 맞지 않는 영수증의 식별자는 현재 요청으로 보이지 않도록 적지 않습니다.
      root.append(...actionIdentifiers(event, s, mismatch ? null : receipt));
      root.append(textNode('p', 'AI 제안은 실행이 아닙니다. 조치는 사람 확인 → 서버 전달 → 연동 시스템 결과 재조회 순서로만 처리되며, 서버 접수(ACK)는 효과 확인이 아닙니다. 「조치 화면 취소」는 이미 서버에 전달된 조치 효과를 되돌리지 않습니다.', 'muted'));
      return root;
    },
  };
}
