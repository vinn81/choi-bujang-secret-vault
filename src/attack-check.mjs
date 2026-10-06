// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (config.step !== 2) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
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
  const inspectNotes = async (path) => {
    try {
      const response = await fetch(new URL(path, app), {
        redirect: 'error', signal: AbortSignal.timeout(10000),
      });
      let noteCount = null;
      try {
        const data = await response.json();
        if (Array.isArray(data?.notes)) noteCount = data.notes.length;
      } catch {
        // Only record the status and count; never include a response body.
      }
      return { status: response.status, noteCount };
    } catch {
      return { status: 'request_failed', noteCount: null };
    }
  };

  const staticData = await inspectNotes('/data.json');
  const publicApi = await inspectNotes('/api/notes');
  return [
    {
      attackId: 'static_notes_removed',
      expected: '비로그인 /data.json의 메모 0건',
      observed: `/data.json HTTP ${staticData.status} · 메모 ${staticData.noteCount ?? '확인 불가'}건`,
    },
    {
      attackId: 'anonymous_notes_api',
      expected: '2단계 공개 API의 비로그인 메모 4건 노출 관찰',
      observed: `/api/notes HTTP ${publicApi.status} · 메모 ${publicApi.noteCount ?? '확인 불가'}건`,
    },
  ];
}
