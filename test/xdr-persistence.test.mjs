import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { alertLines, buildBlockRules } from '../xdr/apply-lib.mjs';
import { decide } from '../xdr/persistence/decide.mjs';
import { readAlerts, redact } from '../xdr/persistence/read-alerts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ids = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => `ps-${String(from + i).padStart(2, '0')}`);
const make = (level, description, data = {}, mitre = ['T1543']) => ({
  id: 'x', timestamp: '2026-09-27T09:00:00+09:00', agent: { name: 'choi-bujang-pc' },
  rule: { level, description, mitre }, data: { srcip: '192.0.2.10', srcuser: 'user01', ...data },
});

async function decideAll() {
  const { alerts } = await readAlerts('persistence', root);
  return alerts.map((alert) => ({ alert, decision: decide(alert) }));
}

test('읽기 모듈은 경보 건수만큼 줄을 뽑고 비밀값처럼 보이는 값을 가립니다', async () => {
  const { alerts, lines } = await readAlerts('persistence', root);
  assert.equal(alerts.length, 24);
  assert.equal(lines.length, alerts.length);
  assert.deepEqual(Object.keys(lines[0]), ['id', 'timestamp', 'srcip', 'user', 'level', 'description']);
  assert.equal(redact('token=abc 그리고 Bearer abcdefghij1234'), '[가림] 그리고 [가림]');
});

test('패턴마다 근거가 한 줄씩 있고 판단 이유에 같은 이름이 쓰입니다', async () => {
  const { patterns } = JSON.parse(await readFile(join(root, 'xdr', 'persistence', 'patterns.json'), 'utf8'));
  for (const pattern of patterns) {
    assert.match(pattern.evidence, /T1543|T1053/u);
    assert.ok(pattern.name && pattern.condition);
  }
  const names = patterns.map((pattern) => pattern.name);
  for (const { decision } of (await decideAll()).filter((item) => item.decision.action !== 'record')) {
    assert.ok(names.some((name) => decision.reason.includes(name)), decision.reason);
  }
});

test('decide.mjs 는 decide 하나만 내보내고 다른 파일을 불러오지 않습니다', async () => {
  const source = await readFile(join(root, 'xdr', 'persistence', 'decide.mjs'), 'utf8');
  assert.equal(/^\s*import\s/mu.test(source), false);
  assert.deepEqual(Object.keys(await import('../xdr/persistence/decide.mjs')), ['decide']);
});

test('명확한 공격은 block, 애매한 시도는 alert, 정상 이벤트는 record 입니다', async () => {
  const items = await decideAll();
  const actionOf = (id) => items.find((item) => item.alert.id === id).decision.action;
  for (const id of ids(1, 8)) assert.equal(actionOf(id), 'block', id);
  for (const id of ids(9, 16)) assert.equal(actionOf(id), 'alert', id);
  for (const id of ids(17, 24)) assert.equal(actionOf(id), 'record', id);
  for (const { decision } of items) {
    assert.ok(decision.confidence >= 0 && decision.confidence <= 1);
    assert.ok(decision.reason.length > 0);
  }
});

test('모양이 조금 달라도 서명 없는 등록은 block 하고 정상 이벤트는 막지 않습니다', () => {
  assert.equal(decide(make(12, '서명 없는 서비스가 새로 등록됐습니다.')).action, 'block');
  assert.equal(decide(make(10, '처음 보는 예약 작업입니다.', {}, ['T1053'])).action, 'block');
  assert.equal(decide(make(8, '서명 없는 파일이 임시 폴더에서 예약 작업으로 실행됩니다.', { path: 'C:\\Temp\\a.exe' }, ['T1053'])).action, 'block');
  assert.equal(decide(make(6, '수업 도구 서명은 아직 모릅니다.')).action, 'alert');
  assert.equal(decide(make(12, '서명된 기존 서비스가 평소 시각에 실행 중입니다.')).action, 'alert'); // 정상 표현이 있으면 막지 않음
  assert.equal(decide(make(3, '기존 수업 도구 서비스가 서명된 채로 실행 중입니다.')).action, 'record');
  assert.equal(decide(make(12, '서명 없는 서비스가 새로 등록됐습니다.', {}, [])).action, 'record'); // 지속성 표시가 없음
  assert.equal(decide({}).action, 'record');
  assert.equal(decide(null).action, 'record');
});

test('거부 규칙은 명확한 시도 주소만 담고 만료 시각과 근거 경보 번호가 있습니다', async () => {
  const items = await decideAll();
  const rules = buildBlockRules(items, 'persistence');
  const blocked = new Set(items.filter((item) => item.decision.action === 'block').map((item) => item.alert.data.srcip));
  assert.deepEqual(new Set(rules.map((rule) => rule.srcip)), blocked);
  const safe = new Set(items.filter((item) => item.decision.action !== 'block').map((item) => item.alert.data.srcip));
  for (const rule of rules) {
    assert.equal(safe.has(rule.srcip), false);
    assert.ok(rule.evidenceAlertIds.length >= 1);
    assert.ok(Date.parse(rule.expiresAt) > 0);
    assert.equal(rule.action, 'deny');
  }
  assert.equal(alertLines(items).length, 16);
});
