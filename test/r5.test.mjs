import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';
import { runAttackChecks } from '../src/attack-check.mjs';

const config = {
  step: 4,
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
    step: 4,
    repoUrl: 'https://github.com/student-a/aleph-defense',
    commit: 'a'.repeat(40),
    publicAppUrl: 'https://student-defense-123.vercel.app',
    judgeIssuer: config.judgeIssuer,
    sampleMarker: config.sampleMarker,
  });
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_PROVIDER: undefined }, config));
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_COMMIT_SHA: 'short' }, config));
});

test('fourth-stage checks record empty static data and anonymous API denials', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = async (url, init) => {
      const requestUrl = String(url);
      requests.push({ requestUrl, init });
      const isStaticData = requestUrl.endsWith('/data.json');
      return new Response(JSON.stringify(isStaticData ? { notes: [] } : {}), {
        status: isStaticData ? 200 : 401,
        headers: { 'content-type': 'application/json' },
      });
    };

    const results = await runAttackChecks(config);

    assert.deepEqual(requests.map(({ requestUrl, init }) => ({
      path: new URL(requestUrl).pathname,
      method: init.method ?? 'GET',
    })), [
      { path: '/data.json', method: 'GET' },
      { path: '/api/notes', method: 'GET' },
      { path: '/api/notes', method: 'POST' },
      { path: '/api/notes/00000000-0000-4000-8000-000000000000', method: 'GET' },
      { path: '/api/notes/00000000-0000-4000-8000-000000000000', method: 'PUT' },
      { path: '/api/notes/00000000-0000-4000-8000-000000000000', method: 'DELETE' },
    ]);
    assert.ok(requests.every(item => item.init.redirect === 'error'));
    assert.match(results[0].observed, /HTTP 200 .* 0건/u);
    assert.match(results[1].observed, /HTTP 401/u);
    assert.match(results[2].observed, /HTTP 401/u);
    assert.match(results[3].observed, /GET 401 .* PUT 401 .* DELETE 401/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
