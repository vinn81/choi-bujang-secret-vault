// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (![5, 6, 7, 8, 9, 10].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
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

  const inspect = async (target, init = {}) => {
    try {
      const response = await fetch(target instanceof URL ? target : new URL(target, app), {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
      let noteCount = null;
      try {
        const data = await response.json();
        if (Array.isArray(data)) noteCount = data.length;
        else if (Array.isArray(data?.notes)) noteCount = data.notes.length;
      } catch {
        // Only record status and count; never include a response body.
      }
      return { status: response.status, noteCount };
    } catch {
      return { status: 'request_failed', noteCount: null };
    }
  };

  const loadPublishableKey = async () => {
    try {
      const response = await fetch(new URL('/api/notes?auth=config', app), {
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return null;
      const data = await response.json();
      return typeof data?.publishableKey === 'string'
        && data.publishableKey.startsWith('sb_publishable_') ? data.publishableKey : null;
    } catch {
      return null;
    }
  };

  const itemPath = '/api/notes/00000000-0000-4000-8000-000000000000';
  const publishableKey = await loadPublishableKey();
  const originalDirect = await inspect(originalApi, publishableKey ? {
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` },
  } : {});
  const staticData = await inspect('/data.json');
  const anonymousList = await inspect('/api/notes');
  const anonymousCreate = await inspect('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  // 10단계: 로그인 없이 복원 경로를 부르면 자료 조회 전에 401이어야 합니다.
  const anonymousRestore = config.step >= 10 ? await inspect('/api/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: '00000000-0000-4000-8000-000000000000' }),
  }) : null;
  const [anonymousGet, anonymousPut, anonymousDelete] = await Promise.all([
    inspect(itemPath),
    inspect(itemPath, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }),
    inspect(itemPath, { method: 'DELETE' }),
  ]);

  // 6단계: 로컬 판정기에 가상 요청 두 건을 실제로 넣어 본 결과만 기록합니다(심판 판정 아님).
  const deviceChecks = [];
  if (config.step >= 6) {
    const { decide } = await import('./decider.mjs');
    const { fixtureRequests } = await import('../scripts/fixture-7.mjs');
    const { normal, suspicious } = fixtureRequests();
    const registered = await decide(normal);
    const unregistered = await decide({ ...normal, requestId: crypto.randomUUID(),
      deviceRegistered: false });
    deviceChecks.push(
      {
        attackId: 'registered_device_read',
        expected: '등록 기기의 내 메모 읽기 가상 요청은 allow',
        observed: `로컬 판정기 ${registered.decision} · ${registered.reasonCode}`,
      },
      {
        attackId: 'unregistered_device_read',
        expected: '미등록 기기의 가상 요청은 deny · device_not_registered',
        observed: `로컬 판정기 ${unregistered.decision} · ${unregistered.reasonCode}`,
      },
    );
    // 7단계: 복합 이상 가상 사건과 위조 출처를 로컬 판정기에 넣은 결과입니다.
    // 재로그인 전 실제 자료 차단은 제공 엔진이 없어 여기서 실행하지 않습니다.
    if (config.step >= 7) {
      const unusual = await decide({ ...suspicious, requestId: crypto.randomUUID() });
      const spoofed = await decide({ ...suspicious, requestId: crypto.randomUUID(),
        signals: { ...suspicious.signals, source: 'client_header' } });
      deviceChecks.push(
        {
          attackId: 'unusual_access_step_up',
          expected: '이상 시각·처음 보는 네트워크·대량 읽기가 겹친 가상 사건은 step_up · step_up_required',
          observed: `로컬 판정기 ${unusual.decision} · ${unusual.reasonCode}`,
        },
        {
          attackId: 'spoofed_signal_source',
          expected: '클라이언트 헤더 출처 신호는 신뢰하지 않아 step_up 근거가 되지 않음',
          observed: `로컬 판정기 ${spoofed.decision} · ${spoofed.reasonCode}`,
        },
        {
          attackId: 'step_up_live_block',
          expected: '재로그인 전 실제 자료 차단과 새 로그인 뒤 허용',
          observed: '미실행 · 제공 엔진이 저장소에 없음',
        },
      );
    }
    // 8단계: 자원 구역 규칙을 로컬 판정기에 넣은 결과입니다. 남의 메모 차단은 아래 자료 API 점검과 학생 확인으로 봅니다.
    if (config.step >= 8) {
      const zone = overrides => decide({ ...normal, requestId: crypto.randomUUID(), ...overrides });
      const ownEdit = await zone({ method: 'PUT', path: '/notes/demo', route: 'PUT /notes/:id' });
      const noticeEdit = await zone({ service: 'notices', method: 'PUT', path: '/notices/demo',
        route: 'PUT /notices/:id' });
      const featurePath = await zone({ path: '/notes/export/all', route: 'GET /notes/:id' });
      deviceChecks.push(
        {
          attackId: 'own_note_zone',
          expected: '등록 기기의 자기 메모 수정 가상 요청은 allow',
          observed: `로컬 판정기 ${ownEdit.decision} · ${ownEdit.reasonCode}`,
        },
        {
          attackId: 'student_notice_edit',
          expected: '일반 학생의 강사 공지 수정은 deny · instructor_role_required',
          observed: `로컬 판정기 ${noticeEdit.decision} · ${noticeEdit.reasonCode}`,
        },
        {
          attackId: 'unknown_feature_path',
          expected: '표에 없는 기능 경로(/notes/export/all)는 deny · route_not_allowed',
          observed: `로컬 판정기 ${featurePath.decision} · ${featurePath.reasonCode}`,
        },
      );
    }
    // 9단계: 로컬 탐지 함수에 가상 조회 사건을 넣은 결과입니다. 실제 회수와 경과 시간은 심판이 확인합니다.
    if (config.step >= 9) {
      const { detect, revocationProposal } = await import('./detect.mjs');
      const start = Date.UTC(2026, 9, 1);
      const reads = (count, sub) => Array.from({ length: count }, (_, index) => ({
        at: new Date(start + index * 2000).toISOString(), method: 'GET', identity: { sub },
        deviceId: 'a'.repeat(16),
      }));
      const ordinary = detect(reads(30, 'learner_fixture'));
      const burst = reads(121, 'learner_fixture');
      const burstResult = detect(burst);
      const proposal = revocationProposal(burst);
      deviceChecks.push(
        {
          attackId: 'normal_reads_observed',
          expected: '같은 사용자 조회 30건은 observe, 회수 제안 없음',
          observed: `로컬 탐지 ${ordinary.action}`,
        },
        {
          attackId: 'burst_read_detected',
          expected: '10분 안 조회 121건은 propose_revocation · burst_read',
          observed: `로컬 탐지 ${burstResult.action} · ${burstResult.reasonCode ?? '없음'}`,
        },
        {
          attackId: 'revocation_proposal_target',
          expected: '회수 제안은 가상 사용자·기기 하나와 이유 코드를 담음',
          observed: proposal ? `로컬 제안 ${proposal.reasonCode} · 기기 ${proposal.deviceId ? '1개' : '미확인'}` : '로컬 제안 없음',
        },
        {
          attackId: 'live_revocation',
          expected: '운영 엔진의 실제 회수와 첫 의심부터 회수까지 경과 시간',
          observed: '미실행 · 운영 엔진 연결 없음, 심판이 확인',
        },
      );
    }
  }

  return [
    ...deviceChecks,
    {
      attackId: 'direct_original_notes',
      expected: '원본 API 직접 GET은 HTTP 401 또는 403, 메모 없음',
      observed: `${publishableKey ? 'publishable 키' : '키 없음'} 직접 GET HTTP ${originalDirect.status} · 메모 ${originalDirect.noteCount ?? '확인 불가'}건`,
    },
    {
      attackId: 'static_notes_removed',
      expected: '비로그인 /data.json의 메모 0건',
      observed: `/data.json HTTP ${staticData.status} · 메모 ${staticData.noteCount ?? '확인 불가'}건`,
    },
    {
      attackId: 'anonymous_notes_list',
      expected: '비로그인 GET /api/notes는 HTTP 401, 메모 없음',
      observed: `GET /api/notes HTTP ${anonymousList.status} · 메모 ${anonymousList.noteCount ?? '확인 불가'}건`,
    },
    {
      attackId: 'anonymous_notes_create',
      expected: '비로그인 POST /api/notes는 HTTP 401',
      observed: `POST /api/notes HTTP ${anonymousCreate.status}`,
    },
    ...(anonymousRestore ? [
      {
        attackId: 'anonymous_restore',
        expected: '비로그인 POST /api/restore는 HTTP 401',
        observed: `POST /api/restore HTTP ${anonymousRestore.status}`,
      },
      {
        attackId: 'restore_owner_hash_live',
        expected: '시험 계정 B 메모 한 건 복원 뒤 ID·소유자·내용 해시가 사본과 같음, B의 A 메모 복원 404',
        observed: '미실행 · 로그인 토큰이 필요한 학생 직접 확인 항목',
      },
    ] : []),
    {
      attackId: 'anonymous_note_item',
      expected: '비로그인 GET·PUT·DELETE /api/notes/:id는 모두 HTTP 401',
      observed: `GET ${anonymousGet.status} · PUT ${anonymousPut.status} · DELETE ${anonymousDelete.status}`,
    },
  ];
}
