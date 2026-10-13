// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
// 12단계: 심판은 이 점검을 격리 환경에서 실행하며 공개 HTTPS 주소로 GET·HEAD 요청만 허용합니다.
// 쓰기 요청(POST·PUT·DELETE)이 필요한 점검은 보내지 않고 observed를 not_run으로 둡니다.
// 그 쓰기 요청 결과는 작전실의 1~11단계 실측 재확인(로그인한 브라우저에서 실행)으로 남깁니다.
// 묶음은 네트워크 요청을 보내지 않습니다. 보내지 않은 점검은 모두 observed를 not_run으로 둡니다.
// 비로그인 GET 거부(401)·/data.json 메모 0건 같은 실측은 배포 서버의 요청 기록(작전실 「서버 요청 기록」)과
// 작전실의 1~11단계 실측 재확인 표에서 요청 ID와 함께 확인합니다.
export async function runAttackChecks(config) {
  if (![5, 6, 7, 8, 9, 10, 11, 12].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  let app;
  let originalApi;
  try {
    app = new URL(config.publicAppUrl);
    originalApi = new URL(config.originalApiUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소와 원본 API 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')
      || originalApi.protocol !== 'https:' || originalApi.username || originalApi.password
      || originalApi.search || originalApi.hash || originalApi.hostname.endsWith('.example')
      || originalApi.origin === app.origin) {
    throw new Error('aleph.config.json의 실제 배포 주소와 원본 API 주소를 먼저 넣어 주세요.');
  }

  // 6~9단계: 판정기·탐지는 이 점검에서 HTTP 요청을 보내지 않으므로 observed를 not_run으로 둡니다.
  // 계산 결과를 실측처럼 적지 않습니다. 결과는 npm run decider:test·detect:test와 작전실(서버 실행 표시)에서 확인합니다.
  const LOCAL_ONLY = ' (요청을 보내지 않는 판정기·탐지 점검)';
  const localChecks = [
    [6, 'registered_device_read', '등록 기기의 내 메모 읽기 가상 요청은 allow'],
    [6, 'unregistered_device_read', '미등록 기기의 가상 요청은 deny · device_not_registered'],
    [7, 'unusual_access_step_up', '이상 시각·처음 보는 네트워크·대량 읽기가 겹친 가상 사건은 step_up · step_up_required'],
    [7, 'spoofed_signal_source', '클라이언트 헤더 출처 신호는 신뢰하지 않아 step_up 근거가 되지 않음'],
    [7, 'step_up_live_block', '재로그인 전 실제 자료 차단과 새 로그인 뒤 허용(제공 엔진 집행)'],
    [8, 'own_note_zone', '등록 기기의 자기 메모 수정 가상 요청은 allow'],
    [8, 'student_notice_edit', '일반 학생의 강사 공지 수정은 deny · instructor_role_required'],
    [8, 'unknown_feature_path', '표에 없는 기능 경로(/notes/export/all)는 deny · route_not_allowed'],
    [9, 'normal_reads_observed', '같은 사용자 조회 30건은 observe, 회수 제안 없음'],
    [9, 'burst_read_detected', '10분 안 조회 121건은 propose_revocation · burst_read'],
    [9, 'revocation_proposal_target', '회수 제안은 가상 사용자·기기 하나와 이유 코드를 담음'],
    [9, 'live_revocation', '운영 엔진의 실제 회수와 첫 의심부터 회수까지 경과 시간(제공 엔진 집행)'],
  ].filter(([stage]) => config.step >= stage)
    .map(([, attackId, expected]) => ({ attackId, expected: `${expected}${LOCAL_ONLY}`, observed: 'not_run' }));

  const LIVE_ELSEWHERE = ' (묶음에서 요청을 보내지 않음, 실측은 작전실 서버 요청 기록)';
  // 결과 순서는 시작 틀과 같게 실제 요청을 보낸 순서(원본 API, /data.json, 목록, 추가, 한 건)를 앞에 두고,
  // 10~12단계 점검을 그 뒤에, 요청을 보내지 않는 판정기·탐지 점검을 맨 뒤에 둡니다.
  return [
    {
      attackId: 'direct_original_notes',
      expected: `원본 API 직접 GET은 HTTP 401 또는 403, 메모 없음${LIVE_ELSEWHERE}`,
      observed: 'not_run',
    },
    {
      attackId: 'static_notes_removed',
      expected: `비로그인 /data.json의 메모 0건${LIVE_ELSEWHERE}`,
      observed: 'not_run',
    },
    {
      attackId: 'anonymous_notes_list',
      expected: `비로그인 GET /api/notes는 HTTP 401, 메모 없음${LIVE_ELSEWHERE}`,
      observed: 'not_run',
    },
    {
      attackId: 'anonymous_notes_create',
      expected: '비로그인 POST /api/notes는 HTTP 401 (쓰기 요청이라 묶음에서 보내지 않음)',
      observed: 'not_run',
    },
    {
      attackId: 'anonymous_note_item',
      expected: `비로그인 GET /api/notes/:id는 HTTP 401 (PUT·DELETE 포함)${LIVE_ELSEWHERE}`,
      observed: 'not_run',
    },
    ...(config.step >= 10 ? [
      {
        attackId: 'anonymous_restore',
        expected: '비로그인 POST /api/restore는 HTTP 401, B 메모 한 건 복원 뒤 ID·소유자·내용 해시 일치 (쓰기 요청이라 묶음에서 보내지 않음)',
        observed: 'not_run',
      },
    ] : []),
    ...(config.step >= 11 ? [
      {
        attackId: 'anonymous_device_flow',
        expected: '비로그인 POST /api/device/register·verify는 HTTP 401 (쓰기 요청이라 묶음에서 보내지 않음)',
        observed: 'not_run',
      },
    ] : []),
    ...(config.step >= 12 ? [
      {
        attackId: 'anonymous_ops_summary',
        expected: `비로그인 GET /api/ops는 HTTP 401${LIVE_ELSEWHERE}`,
        observed: 'not_run',
      },
    ] : []),
    ...localChecks,
  ];
}
