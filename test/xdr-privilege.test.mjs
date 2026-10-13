import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { alertLines, buildBlockRules } from '../xdr/apply-lib.mjs';
import { decide } from '../xdr/privilege/decide.mjs';
import { readAlerts, redact } from '../xdr/privilege/read-alerts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ids = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => `pv-${String(from + i).padStart(2, '0')}`);
const make = (level, description, data = {}, mitre = ['T1078']) => ({
  id: 'x', timestamp: '2026-09-27T09:00:00+09:00', agent: { name: 'choi-bujang-pc' },
  rule: { level, description, mitre }, data: { srcip: '192.0.2.10', srcuser: 'user01', ...data },
});

async function decideAll() {
  const { alerts } = await readAlerts('privilege', root);
  return alerts.map((alert) => ({ alert, decision: decide(alert) }));
}

test('읽기 모듈은 경보 건수만큼 줄을 뽑고 비밀값처럼 보이는 값을 가립니다', async () => {
  const { alerts, lines } = await readAlerts('privilege', root);
  assert.equal(alerts.length, 26);
  assert.equal(lines.length, alerts.length);
  assert.deepEqual(Object.keys(lines[0]), ['id', 'timestamp', 'srcip', 'user', 'level', 'description']);
  assert.equal(redact('password=abc 그리고 Bearer abcdefghij1234'), '[가림] 그리고 [가림]');
});

test('패턴마다 근거가 한 줄씩 있고 판단 이유에 같은 이름이 쓰입니다', async () => {
  const { patterns } = JSON.parse(await readFile(join(root, 'xdr', 'privilege', 'patterns.json'), 'utf8'));
  for (const pattern of patterns) {
    assert.match(pattern.evidence, /T1068|T1078/u);
    assert.ok(pattern.name && pattern.condition);
  }
  const names = patterns.map((pattern) => pattern.name);
  for (const { decision } of (await decideAll()).filter((item) => item.decision.action !== 'record')) {
    assert.ok(names.some((name) => decision.reason.includes(name)), decision.reason);
  }
});

test('decide.mjs 는 decide 하나만 내보내고 다른 파일을 불러오지 않습니다', async () => {
  const source = await readFile(join(root, 'xdr', 'privilege', 'decide.mjs'), 'utf8');
  assert.equal(/^\s*import\s/mu.test(source), false);
  assert.deepEqual(Object.keys(await import('../xdr/privilege/decide.mjs')), ['decide']);
});

test('명확한 공격은 block, 애매한 시도는 alert, 정상 이벤트는 record 입니다', async () => {
  const items = await decideAll();
  const actionOf = (id) => items.find((item) => item.alert.id === id).decision.action;
  for (const id of ids(1, 9)) assert.equal(actionOf(id), 'block', id);
  for (const id of ids(10, 17)) assert.equal(actionOf(id), 'alert', id);
  for (const id of ids(18, 26)) assert.equal(actionOf(id), 'record', id);
  for (const { decision } of items) {
    assert.ok(decision.confidence >= 0 && decision.confidence <= 1);
    assert.ok(decision.reason.length > 0);
  }
});

test('모양이 조금 달라도 권한 가로채기는 block 하고 정상 이벤트는 막지 않습니다', () => {
  assert.equal(decide(make(12, 'userXX 가 관리자 그룹에 추가됐습니다.')).action, 'block');
  assert.equal(decide(make(11, '처음 보는 주소에서 관리자 명령을 실행했습니다.', {}, ['T1068'])).action, 'block');
  assert.equal(decide(make(8, '수업 시간 밖에 관리자 명령이 실행됐고 요청 주소는 처음 봅니다.', {}, ['T1068'])).action, 'block');
  assert.equal(decide(make(6, '수업 시간에 권한 상승 창이 한 번 뜨고 취소됐습니다.', {}, ['T1068'])).action, 'alert');
  assert.equal(decide(make(12, '관리자 명령이 실패 1건으로 끝났습니다.', {}, ['T1068'])).action, 'alert'); // 결과가 이어지지 않음
  assert.equal(decide(make(3, 'user01 이 로그인했습니다.', {}, [])).action, 'record');
  assert.equal(decide(make(12, '수업용 관리 계정 admin01 이 평소 주소에서 로그인했습니다.', {}, [])).action, 'record'); // 권한 상승 표시가 없음
  assert.equal(decide({}).action, 'record');
  assert.equal(decide(null).action, 'record');
});

test('거부 규칙은 명확한 시도 주소만 담고 만료 시각과 근거 경보 번호가 있습니다', async () => {
  const items = await decideAll();
  const rules = buildBlockRules(items, 'privilege');
  const blocked = new Set(items.filter((item) => item.decision.action === 'block').map((item) => item.alert.data.srcip));
  assert.deepEqual(new Set(rules.map((rule) => rule.srcip)), blocked);
  const safe = new Set(items.filter((item) => item.decision.action !== 'block').map((item) => item.alert.data.srcip));
  for (const rule of rules) {
    assert.equal(safe.has(rule.srcip), false);
    assert.ok(rule.evidenceAlertIds.length >= 1);
    assert.ok(Date.parse(rule.expiresAt) > 0);
    assert.equal(rule.action, 'deny');
  }
  assert.equal(alertLines(items).length, 17);
});
