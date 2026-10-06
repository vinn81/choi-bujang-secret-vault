import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';
import { runAttackChecks } from '../src/attack-check.mjs';

const config = {
  step: 5,
  judgeIssuer: 'https://aleph-judge-production.up.railway.app/defense/judge',
  sampleMarker: 'SAMPLE_NOTE_1',
  publicAppUrl: 'https://student-defense.vercel.app',
  allowedRoutes: ['GET /api/notes'],
  originalApiUrl: 'https://student-project.supabase.co/rest/v1/notes',
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
    step: 5,
    repoUrl: 'https://github.com/student-a/aleph-defense',
    commit: 'a'.repeat(40),
    publicAppUrl: 'https://student-defense-123.vercel.app',
    judgeIssuer: config.judgeIssuer,
    sampleMarker: config.sampleMarker,
    allowedRoutes: config.allowedRoutes,
    originalApiUrl: config.originalApiUrl,
  });
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_PROVIDER: undefined }, config));
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_COMMIT_SHA: 'short' }, config));
  assert.throws(() => deploymentIdentity(env, { ...config, allowedRoutes: [] }));
  assert.throws(() => deploymentIdentity(env, { ...config, originalApiUrl: null }));
  assert.throws(() => deploymentIdentity(env, {
    ...config,
    originalApiUrl: `${config.originalApiUrl}?select=*`,
  }));
});

test('fifth-stage checks record direct storage and anonymous API denials', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const publishableKey = 'sb_publishable_test-only-not-a-real-key';
  try {
    globalThis.fetch = async (url, init) => {
      const requestUrl = String(url);
      requests.push({ requestUrl, init });
      const parsed = new URL(requestUrl);
      const isAuthConfig = parsed.pathname === '/api/notes'
        && parsed.searchParams.get('auth') === 'config';
      const isStaticData = requestUrl.endsWith('/data.json');
      const body = isAuthConfig ? { publishableKey } : (isStaticData ? { notes: [] } : {});
      return new Response(JSON.stringify(body), {
        status: isAuthConfig || isStaticData ? 200 : 401,
        headers: { 'content-type': 'application/json' },
      });
    };

    const results = await runAttackChecks(config);

    assert.deepEqual(requests.map(({ requestUrl, init }) => ({
      path: `${new URL(requestUrl).pathname}${new URL(requestUrl).search}`,
      method: init.method ?? 'GET',
    })), [
      { path: '/api/notes?auth=config', method: 'GET' },
      { path: '/rest/v1/notes', method: 'GET' },
      { path: '/data.json', method: 'GET' },
      { path: '/api/notes', method: 'GET' },
      { path: '/api/notes', method: 'POST' },
      { path: '/api/notes/00000000-0000-4000-8000-000000000000', method: 'GET' },
      { path: '/api/notes/00000000-0000-4000-8000-000000000000', method: 'PUT' },
      { path: '/api/notes/00000000-0000-4000-8000-000000000000', method: 'DELETE' },
    ]);
    assert.ok(requests.every(item => item.init.redirect === 'error'));
    assert.equal(requests[1].init.headers.apikey, publishableKey);
    assert.match(results[0].observed, /publishable 키.*HTTP 401/u);
    assert.match(results[1].observed, /HTTP 200 .* 0건/u);
    assert.match(results[2].observed, /HTTP 401/u);
    assert.match(results[3].observed, /HTTP 401/u);
    assert.match(results[4].observed, /GET 401 .* PUT 401 .* DELETE 401/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
