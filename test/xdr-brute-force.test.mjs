import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { decide } from '../xdr/brute-force/decide.mjs';
import { readAlerts, redact } from '../xdr/brute-force/read-alerts.mjs';
import { alertLines, buildBlockRules } from '../xdr/brute-force/apply.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ids = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => `bf-${String(from + i).padStart(2, '0')}`);
const make = (level, data, description = '로그인 실패가 쌓였습니다.', mitre = ['T1110']) => ({
  id: 'x', timestamp: '2026-09-27T09:00:00+09:00', agent: { name: 'choi-bujang-pc' },
  rule: { level, description, mitre }, data: { srcip: '192.0.2.10', ...data },
});

async function decideAll() {
  const { alerts } = await readAlerts('brute-force', root);
  return Promise.all(alerts.map(async (alert) => ({ alert, decision: await decide(alert) })));
}

async function withJev(url, fetchImpl, run) {
  const savedFetch = globalThis.fetch;
  const savedUrl = process.env.JEV_API_URL;
  if (url) process.env.JEV_API_URL = url; else delete process.env.JEV_API_URL;
  if (fetchImpl) globalThis.fetch = fetchImpl;
  try { return await run(); } finally {
    globalThis.fetch = savedFetch;
    if (savedUrl === undefined) delete process.env.JEV_API_URL; else process.env.JEV_API_URL = savedUrl;
  }
}

test('읽기 모듈은 경보 건수만큼 줄을 뽑고 비밀값처럼 보이는 값을 가립니다', async () => {
  const { alerts, lines } = await readAlerts('brute-force', root);
  assert.equal(lines.length, alerts.length);
  assert.deepEqual(Object.keys(lines[0]), ['id', 'timestamp', 'srcip', 'user', 'level', 'description']);
  assert.equal(redact('token=abc123 그리고 sb_secret_abcdef'), '[가림] 그리고 [가림]');
});

test('패턴마다 근거가 한 줄씩 있고 판단 이유에 같은 이름이 쓰입니다', async () => {
  const { patterns } = JSON.parse(await readFile(join(root, 'xdr', 'brute-force', 'patterns.json'), 'utf8'));
  for (const pattern of patterns) {
    assert.match(pattern.evidence, /T1110/u);
    assert.ok(pattern.name && pattern.condition);
  }
  const names = patterns.map((pattern) => pattern.name);
  const items = await decideAll();
  for (const { decision } of items.filter((item) => item.decision.action !== 'record')) {
    assert.ok(names.some((name) => decision.reason.includes(name)), decision.reason);
  }
});

test('decide.mjs 는 decide 하나만 내보내고 다른 파일을 불러오지 않습니다', async () => {
  const source = await readFile(join(root, 'xdr', 'brute-force', 'decide.mjs'), 'utf8');
  assert.equal(/^\s*import\s/mu.test(source), false);
  assert.deepEqual(Object.keys(await import('../xdr/brute-force/decide.mjs')), ['decide']);
});

test('명확한 공격은 block, 애매한 시도는 alert, 정상 이벤트는 record 입니다', async () => {
  const items = await withJev(null, null, decideAll);
  const actionOf = (id) => items.find((item) => item.alert.id === id).decision.action;
  for (const id of ids(1, 10)) assert.equal(actionOf(id), 'block', id);
  for (const id of ids(11, 19)) assert.equal(actionOf(id), 'alert', id);
  for (const id of ids(20, 28)) assert.equal(actionOf(id), 'record', id);
  for (const { decision } of items) {
    assert.ok(decision.confidence >= 0 && decision.confidence <= 1);
    assert.ok(decision.reason.length > 0);
  }
});

test('모양이 조금 달라도 뚜렷한 대입 공격은 block 하고 정상 로그인은 막지 않습니다', async () => {
  assert.equal((await decide(make(12, {}))).action, 'block');                       // 수준만 높고 건수 정보가 없음
  assert.equal((await decide(make(11, { count: 25 }, '실패가 이어졌습니다.'))).action, 'block');
  assert.equal((await decide(make(7, { count: 40 }, '로그인 실패 40건'))).action, 'block'); // 수준은 낮지만 건수가 많음
  assert.equal((await decide(make(10, { accounts: 'a,b,c,d,e,f' }, '여러 계정에 실패'))).action, 'block');
  assert.equal((await decide(make(12, { count: '52' }, '로그인 실패', ['T1110.001']))).action, 'block');
  assert.equal((await decide(make(3, { count: 1 }, '로그인 실패 1건 뒤에 성공했습니다.', []))).action, 'record');
  assert.equal((await decide(make(2, {}, '로그인이 성공했습니다.', []))).action, 'record');
  assert.equal((await decide(make(3, {}, '비밀번호 변경이 성공했습니다.', []))).action, 'record');
  assert.equal((await decide({})).action, 'record');
  assert.equal((await decide(null)).action, 'record');
});

test('Jev 가 답하지 않거나 이상하게 답하면 alert 로 떨어집니다', async () => {
  const weak = make(6, { count: 4 }, '같은 계정 로그인 실패 4건 뒤에 성공했습니다.');
  assert.equal((await withJev(null, null, () => decide(weak))).action, 'alert');
  const url = 'https://jev.example/ask';
  assert.equal((await withJev(url, async () => { throw new Error('timeout'); }, () => decide(weak))).action, 'alert');
  assert.equal((await withJev(url, async () => new Response('{"confidence":7}'), () => decide(weak))).action, 'alert');
  assert.equal((await withJev(url, async () => new Response('not json'), () => decide(weak))).action, 'alert');
});

test('Jev 는 애매한 경보를 낮출 수 있지만 차단으로 올리지 못합니다', async () => {
  const weak = make(7, { count: 6 }, '5분 동안 로그인 실패 6건');
  const url = 'https://jev.example/ask';
  const reply = (confidence) => async () => new Response(JSON.stringify({ confidence }));
  assert.equal((await withJev(url, reply(0.99), () => decide(weak))).action, 'alert');
  assert.equal((await withJev(url, reply(0.2), () => decide(weak))).action, 'record');
  assert.equal((await withJev(url, reply(0.99), () => decide(make(3, {}, '로그인이 성공했습니다.', [])))).action, 'record');
});

test('거부 규칙은 명확한 공격 주소만 담고 만료 시각과 근거 경보 번호가 있습니다', async () => {
  const items = await decideAll();
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
