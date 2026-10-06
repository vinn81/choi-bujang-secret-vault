// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (config.step !== 3) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }

  const inspect = async (path, init = {}) => {
    try {
      const response = await fetch(new URL(path, app), {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
      let noteCount = null;
      try {
        const data = await response.json();
        if (Array.isArray(data?.notes)) noteCount = data.notes.length;
      } catch {
        // Only record status and count; never include a response body.
      }
      return { status: response.status, noteCount };
    } catch {
      return { status: 'request_failed', noteCount: null };
    }
  };

  const itemPath = '/api/notes/00000000-0000-4000-8000-000000000000';
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
