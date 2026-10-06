// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (config.step !== 5) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
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
  const [anonymousGet, anonymousPut, anonymousDelete] = await Promise.all([
    inspect(itemPath),
    inspect(itemPath, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }),
    inspect(itemPath, { method: 'DELETE' }),
  ]);

  return [
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
    {
      attackId: 'anonymous_note_item',
      expected: '비로그인 GET·PUT·DELETE /api/notes/:id는 모두 HTTP 401',
      observed: `GET ${anonymousGet.status} · PUT ${anonymousPut.status} · DELETE ${anonymousDelete.status}`,
    },
  ];
}
