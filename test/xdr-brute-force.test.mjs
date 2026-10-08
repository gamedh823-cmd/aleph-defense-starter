import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { decide } from '../xdr/brute-force/decide.mjs';
import { askJev } from '../xdr/brute-force/jev.mjs';
import { decideWith } from '../xdr/brute-force/judge.mjs';
import { readAlerts, redact } from '../xdr/brute-force/read-alerts.mjs';
import { alertLines, buildBlockRules } from '../xdr/brute-force/apply.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const noJev = async () => null;
const ids = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => `bf-${String(from + i).padStart(2, '0')}`);

async function decideAll(options) {
  const { alerts } = await readAlerts('brute-force', root);
  return Promise.all(alerts.map(async (alert) => ({ alert, decision: await decideWith(alert, options.ask) })));
}

test('읽기 모듈은 경보 건수만큼 줄을 뽑고 비밀값처럼 보이는 값을 가립니다', async () => {
  const { alerts, lines } = await readAlerts('brute-force', root);
  assert.equal(lines.length, alerts.length);
  assert.deepEqual(Object.keys(lines[0]), ['id', 'timestamp', 'srcip', 'user', 'level', 'description']);
  assert.equal(redact('token=abc123 그리고 sb_secret_abcdef'), '[가림] 그리고 [가림]');
});

test('패턴마다 근거가 한 줄씩 있습니다', async () => {
  const { patterns } = JSON.parse(await readFile(join(root, 'xdr', 'brute-force', 'patterns.json'), 'utf8'));
  assert.ok(patterns.length >= 3);
  for (const pattern of patterns) {
    assert.match(pattern.evidence, /T1110/u);
    assert.ok(pattern.name && pattern.condition);
  }
});

test('명확한 공격은 block, 애매한 시도는 alert, 정상 이벤트는 record 입니다', async () => {
  const items = await decideAll({ ask: noJev });
  const actionOf = (id) => items.find((item) => item.alert.id === id).decision.action;
  for (const id of ids(1, 10)) assert.equal(actionOf(id), 'block', id);
  for (const id of ids(11, 19)) assert.equal(actionOf(id), 'alert', id);
  for (const id of ids(20, 28)) assert.equal(actionOf(id), 'record', id);
  for (const { decision } of items) {
    assert.ok(decision.confidence >= 0 && decision.confidence <= 1);
    assert.ok(decision.reason.length > 0);
  }
});

test('Jev 가 답하지 않거나 이상하게 답하면 alert 로 떨어집니다', async () => {
  const { alerts } = await readAlerts('brute-force', root);
  const weak = alerts.find((alert) => alert.id === 'bf-11');
  assert.equal((await decideWith(weak, async () => null)).action, 'alert');
  assert.equal(await askJev({}, { env: {} }), null);
  assert.equal(await askJev({}, { env: { JEV_API_URL: 'https://jev.example/ask' }, fetchImpl: async () => { throw new Error('timeout'); } }), null);
  assert.equal(await askJev({}, { env: { JEV_API_URL: 'https://jev.example/ask' }, fetchImpl: async () => new Response('{"confidence":7}') }), null);
});

test('Jev 는 애매한 경보를 낮출 수 있지만 차단으로 올리지 못합니다', async () => {
  const { alerts } = await readAlerts('brute-force', root);
  const weak = alerts.find((alert) => alert.id === 'bf-12');
  assert.equal((await decideWith(weak, async () => 0.99)).action, 'alert');
  assert.equal((await decideWith(weak, async () => 0.2)).action, 'record');
  const normal = alerts.find((alert) => alert.id === 'bf-20');
  assert.equal((await decideWith(normal, async () => 0.99)).action, 'record');
});

test('거부 규칙은 명확한 공격 주소만 담고 만료 시각과 근거 경보 번호가 있습니다', async () => {
  const items = await decideAll({ ask: noJev });
  const rules = buildBlockRules(items);
  const blocked = new Set(items.filter((item) => item.decision.action === 'block').map((item) => item.alert.data.srcip));
  assert.deepEqual(new Set(rules.map((rule) => rule.srcip)), blocked);
  const safe = new Set(items.filter((item) => item.decision.action !== 'block').map((item) => item.alert.data.srcip));
  for (const rule of rules) {
    assert.equal(safe.has(rule.srcip), false);
    assert.ok(rule.evidenceAlertIds.length >= 1);
    assert.ok(Date.parse(rule.expiresAt) > 0);
    assert.equal(rule.action, 'deny');
  }
  assert.equal(alertLines(items).length, 19);
});
