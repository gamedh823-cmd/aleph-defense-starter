import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { alertLines, buildBlockRules } from '../xdr/apply-lib.mjs';
import { decide } from '../xdr/exfiltration/decide.mjs';
import { readAlerts, redact } from '../xdr/exfiltration/read-alerts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ids = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => `ex-${String(from + i).padStart(2, '0')}`);
const make = (level, description, data = {}, mitre = ['T1048']) => ({
  id: 'x', timestamp: '2026-09-27T09:00:00+09:00', agent: { name: 'choi-bujang-pc' },
  rule: { level, description, mitre }, data: { srcip: '192.0.2.20', srcuser: 'user01', dstip: '203.0.113.50', ...data },
});

async function decideAll() {
  const { alerts } = await readAlerts('exfiltration', root);
  return alerts.map((alert) => ({ alert, decision: decide(alert) }));
}

test('읽기 모듈은 경보 건수만큼 줄을 뽑고 비밀값처럼 보이는 값을 가립니다', async () => {
  const { alerts, lines } = await readAlerts('exfiltration', root);
  assert.equal(alerts.length, 30);
  assert.equal(lines.length, alerts.length);
  assert.deepEqual(Object.keys(lines[0]), ['id', 'timestamp', 'srcip', 'user', 'level', 'description']);
  assert.equal(redact('token=abc 그리고 sb_secret_abcdef'), '[가림] 그리고 [가림]');
});

test('패턴마다 근거가 한 줄씩 있고 판단 이유에 같은 이름이 쓰입니다', async () => {
  const { patterns } = JSON.parse(await readFile(join(root, 'xdr', 'exfiltration', 'patterns.json'), 'utf8'));
  for (const pattern of patterns) {
    assert.match(pattern.evidence, /T1041|T1048/u);
    assert.ok(pattern.name && pattern.condition);
  }
  const names = patterns.map((pattern) => pattern.name);
  for (const { decision } of (await decideAll()).filter((item) => item.decision.action !== 'record')) {
    assert.ok(names.some((name) => decision.reason.includes(name)), decision.reason);
  }
});

test('decide.mjs 는 decide 하나만 내보내고 다른 파일을 불러오지 않습니다', async () => {
  const source = await readFile(join(root, 'xdr', 'exfiltration', 'decide.mjs'), 'utf8');
  assert.equal(/^\s*import\s/mu.test(source), false);
  assert.deepEqual(Object.keys(await import('../xdr/exfiltration/decide.mjs')), ['decide']);
});

test('명확한 반출은 block, 애매한 시도는 alert, 정상 이벤트는 record 입니다', async () => {
  const items = await decideAll();
  const actionOf = (id) => items.find((item) => item.alert.id === id).decision.action;
  for (const id of ids(1, 10)) assert.equal(actionOf(id), 'block', id);
  for (const id of ids(11, 20)) assert.equal(actionOf(id), 'alert', id);
  for (const id of ids(21, 30)) assert.equal(actionOf(id), 'record', id);
  for (const { decision } of items) {
    assert.ok(decision.confidence >= 0 && decision.confidence <= 1);
    assert.ok(decision.reason.length > 0);
  }
});

test('모양이 조금 달라도 대용량 반출은 block 하고 작은·실패 전송은 막지 않습니다', () => {
  assert.equal(decide(make(12, '처음 보는 목적지로 자료가 나갔습니다.', { bytes: '90000000' })).action, 'block');
  assert.equal(decide(make(11, '명령 통로로 큰 자료가 나갔습니다.', { bytes: 120000000 }, ['T1041'])).action, 'block');
  assert.equal(decide(make(9, '수업 시간 밖에 압축 파일이 처음 보는 주소로 나갔습니다.', { bytes: '150000000' })).action, 'block');
  assert.equal(decide(make(12, '처음 보는 목적지로 작은 파일이 나갔습니다.', { bytes: '4000' })).action, 'alert'); // 1메가바이트 미만
  assert.equal(decide(make(12, '전송이 실패했습니다. 목적지는 처음 봅니다.', { bytes: '0' })).action, 'alert');
  assert.equal(decide(make(3, '내 메모를 읽었습니다.', { bytes: '2400' }, [])).action, 'record');
  assert.equal(decide(make(12, '처음 보는 목적지로 자료가 나갔습니다.', { bytes: '90000000' }, [])).action, 'record'); // 외부 전송 표시가 없음
  assert.equal(decide({}).action, 'record');
  assert.equal(decide(null).action, 'record');
});

test('거부 규칙은 명확한 반출의 목적지만 담고 만료 시각과 근거 경보 번호가 있습니다', async () => {
  const items = await decideAll();
  const rules = buildBlockRules(items, 'exfiltration', 'dstip');
  const blocked = new Set(items.filter((item) => item.decision.action === 'block').map((item) => item.alert.data.dstip));
  assert.deepEqual(new Set(rules.map((rule) => rule.dstip)), blocked);
  const safe = new Set(items.filter((item) => item.decision.action !== 'block').map((item) => item.alert.data.dstip));
  for (const rule of rules) {
    assert.equal(safe.has(rule.dstip), false);
    assert.equal('srcip' in rule, false);
    assert.ok(rule.evidenceAlertIds.length >= 1);
    assert.ok(Date.parse(rule.expiresAt) > 0);
    assert.equal(rule.action, 'deny');
  }
  assert.equal(alertLines(items).length, 20);
});
