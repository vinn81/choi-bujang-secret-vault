import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { decide } from '../xdr/brute-force/decide.mjs';
import { readAlerts } from '../xdr/brute-force/read-alerts.mjs';
import { publishXdrResult, decideWithTemporaryDeny } from '../xdr/brute-force/connect.mjs';
import { decide as originalDecide } from '../src/decider.mjs';

// 외부 Jev API 없이 탐지와 연결 로직만 검사합니다.
delete process.env.TYPESAFE_API_KEY;
const fixture = JSON.parse(await readFile(new URL('../xdr/fixtures/brute-force.json', import.meta.url), 'utf8'));
const at = new Date('2026-10-08T01:00:00Z');

test('원본 28건과 5개 추출 항목을 확인합니다', async () => {
  const rows = await readAlerts();
  assert.equal(rows.length, fixture.alerts.length);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['description', 'level', 'srcip', 'srcuser', 'timestamp']);
  const counts = { block: 0, alert: 0, record: 0 };
  for (const [i, alert] of fixture.alerts.entries()) {
    const result = await decide(alert);
    assert.equal(result.action, i < 10 ? 'block' : i < 19 ? 'alert' : 'record', alert.id);
    counts[result.action]++;
  }
  assert.deepEqual(counts, { block: 10, alert: 9, record: 9 });
});

test('문구 변형과 낮은 수준의 대량 실패, 단일 계정 및 성공을 확인합니다', async () => {
  const cases = [
    ['같은 비밀번호로 로그인 실패가 2건입니다.', 2, 12, 'alert'],
    ['같은 주소에서 2분 안에 로그인 실패 50건이 쌓였습니다.', 50, 3, 'block'],
    ['같은 주소에서 2분 안에 로그인 실패 48회가 쌓였습니다.', 48, 12, 'block'],
    ['같은 주소에서 2분 안에 로그인 실패 48번이 쌓였습니다.', 48, 12, 'block'],
    ['같은 주소에서 2분 안에 로그인 실패가 반복되었습니다.', 48, 12, 'block'],
    ['2분 안에 비밀번호를 한 글자씩 바꿔 넣는 실패가 18건입니다. 성공은 없습니다.', 18, 10, 'block'],
    ['같은 비밀번호로 로그인이 성공했습니다.', 0, 12, 'record'],
    ['로그인 실패 1건 뒤에 성공했습니다.', 1, 3, 'record'],
    ['60분 동안 로그인 실패 48건이 쌓였습니다.', 48, 12, 'alert'],
  ];
  for (const [description, count, level, expected] of cases) {
    const result = await decide({
      timestamp: at.toISOString(), rule: { level, description },
      data: { srcip: '203.0.113.10', srcuser: 'user01', count: String(count) },
    });
    assert.equal(result.action, expected, description);
  }
});

test('규칙과 알림을 만들고 차단·정상 전달·기존 거부 보존·만료를 확인합니다', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xdr-brute-force-'));
  try {
    await mkdir(join(root, 'xdr', 'brute-force'), { recursive: true });
    const decisions = [];
    for (const alert of fixture.alerts) {
      decisions.push({ alertId: alert.id, ...await decide(alert) });
    }
    const rulesDocument = await publishXdrResult({
      root, moduleKey: 'brute-force', fixture, result: { decisions }, now: at,
    });
    assert.equal(rulesDocument.rules.length, 10);
    assert.equal(new Set(rulesDocument.rules.map((rule) => rule.sourceAddress)).size, 9);
    for (const rule of rulesDocument.rules) {
      assert.equal(Date.parse(rule.expiresAt) - at.getTime(), 15 * 60 * 1000);
      assert.equal(rule.evidenceAlertIds.length, 1);
      assert.ok(decisions.some((d) => d.alertId === rule.evidenceAlertIds[0] && d.action === 'block'));
    }
    const lines = (await readFile(join(root, 'xdr', 'alerts.log'), 'utf8')).trim().split('\n');
    assert.equal(lines.length, 19);
    assert.ok(lines.map(JSON.parse).every((line) => line.action !== 'record'));

    // 아래 등록 코드와 allow 응답은 테스트용입니다. 운영 등록/허용을 뜻하지 않습니다.
    const request = { schema: 'aleph.decision.v1', requestId: 'test-request' };
    const baseResponse = {
      schema: request.schema, requestId: request.requestId,
      decision: 'allow', reasonCode: 'test_allowed', ruleIds: ['test.base'],
    };
    let baseCalls = 0;
    const options = {
      request, rulesDocument, at,
      decide: async (received) => {
        assert.strictEqual(received, request);
        baseCalls++;
        return baseResponse;
      },
      denyResponse: (received, match) => {
        assert.ok(match.evidenceAlertIds.length > 0);
        return {
          schema: received.schema, requestId: received.requestId,
          decision: 'deny', reasonCode: 'test_xdr_block', ruleIds: ['test.xdr'],
        };
      },
      allowedReasonCodes: ['test_xdr_block'], allowedRuleIds: ['test.xdr'],
    };
    for (const alert of fixture.alerts.slice(0, 10)) {
      const response = await decideWithTemporaryDeny({ ...options, trustedSourceAddress: alert.data.srcip });
      assert.equal(response.decision, 'deny', alert.id);
    }
    assert.equal(baseCalls, 0);
    for (const alert of fixture.alerts.slice(10)) {
      const response = await decideWithTemporaryDeny({ ...options, trustedSourceAddress: alert.data.srcip });
      assert.strictEqual(response, baseResponse, alert.id);
    }
    assert.equal(baseCalls, 18);

    const expired = new Date(at.getTime() + 15 * 60 * 1000);
    assert.strictEqual(await decideWithTemporaryDeny({
      ...options, at: expired, trustedSourceAddress: fixture.alerts[0].data.srcip,
    }), baseResponse);

    // 실제 기존 시작 판정기는 deny입니다. 연결 부품이 임의 allow로 바꾸지 않습니다.
    const preserved = await decideWithTemporaryDeny({
      ...options, decide: originalDecide, trustedSourceAddress: fixture.alerts[19].data.srcip,
    });
    assert.deepEqual(preserved, await originalDecide(request));

    await assert.rejects(decideWithTemporaryDeny({ ...options, trustedSourceAddress: undefined }),
      /xdr_verified_source_address_required/u);
    await assert.rejects(decideWithTemporaryDeny({
      ...options, trustedSourceAddress: fixture.alerts[0].data.srcip, allowedReasonCodes: [],
    }), /xdr_registered_deny_response_required/u);
    await assert.rejects(decideWithTemporaryDeny({
      ...options, trustedSourceAddress: fixture.alerts[0].data.srcip, allowedRuleIds: [],
    }), /xdr_registered_deny_response_required/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
