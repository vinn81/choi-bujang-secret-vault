import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';
import { runAttackChecks } from '../src/attack-check.mjs';

const config = {
  step: 2,
  judgeIssuer: 'https://aleph-judge-production.up.railway.app/defense/judge',
  sampleMarker: 'SAMPLE_NOTE_1',
  publicAppUrl: 'https://student-defense.vercel.app',
};
const env = {
  VERCEL_GIT_PROVIDER: 'github',
  VERCEL_GIT_REPO_OWNER: 'Student-A',
  VERCEL_GIT_REPO_SLUG: 'aleph-defense',
  VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40),
  VERCEL_URL: 'student-defense-123.vercel.app',
};

test('build identity uses Vercel Git and deployment metadata', () => {
  assert.deepEqual(deploymentIdentity(env, config), {
    schema: 'aleph.defense.deployment.v1',
    step: 2,
    repoUrl: 'https://github.com/student-a/aleph-defense',
    commit: 'a'.repeat(40),
    publicAppUrl: 'https://student-defense-123.vercel.app',
    judgeIssuer: config.judgeIssuer,
    sampleMarker: config.sampleMarker,
  });
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_PROVIDER: undefined }, config));
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_COMMIT_SHA: 'short' }, config));
});

test('second-stage checks record empty static data and the remaining public API', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = async (url, init) => {
      const requestUrl = String(url);
      requests.push({ requestUrl, init });
      const notes = requestUrl.endsWith('/api/notes')
        ? [{ title: '가상' }, { title: '가상' }, { title: '가상' }, { title: '가상' }]
        : [];
      return new Response(JSON.stringify({ notes }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const results = await runAttackChecks(config);
    assert.deepEqual(requests.map(item => item.requestUrl), [
      'https://student-defense.vercel.app/data.json',
      'https://student-defense.vercel.app/api/notes',
    ]);
    assert.ok(requests.every(item => item.init.redirect === 'error'));
    assert.match(results[0].observed, /메모 0건/u);
    assert.match(results[1].observed, /메모 4건/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
