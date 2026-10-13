import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detect } from '../src/detect.mjs';

const START = Date.UTC(2026, 9, 1);
const reads = (count, { sub = 'learner_a', gap = 2, start = START, method = 'GET' } = {}) =>
  Array.from({ length: count }, (_, i) => ({ at: new Date(start + i * gap * 1000).toISOString(), method, identity: { sub } }));

test('121번째 조회부터 회수를 제안하고 정확히 120건은 제안하지 않는다', () => {
  assert.deepEqual(detect(reads(120)), { action: 'observe' });
  assert.deepEqual(detect(reads(121)), { action: 'propose_revocation', reasonCode: 'burst_read', subject: 'learner_a' });
});

test('제안은 대상과 이유 코드만 담고 사건 내용은 담지 않는다', () => {
  const events = reads(130).map(event => ({ ...event, body: '메모 내용', token: 'x' }));
  assert.deepEqual(Object.keys(detect(events)).sort(), ['action', 'reasonCode', 'subject']);
});

test('GET이 아닌 사건·모양이 틀린 사건은 세지 않는다', () => {
  assert.deepEqual(detect([...reads(100), ...reads(100, { method: 'POST' })]), { action: 'observe' });
  const bad = [null, 1, 'x', {}, { at: 'no', method: 'GET', identity: { sub: 'learner_a' } }, { at: reads(1)[0].at, method: 'GET', identity: {} }];
  assert.deepEqual(detect([...reads(100), ...bad]), { action: 'observe' });
});

test('시각 순서가 섞여 있어도 10분 구간으로 센다', () => {
  assert.equal(detect(reads(121).reverse()).action, 'propose_revocation');
});

test('폭주한 사용자만 지목하고 다른 사용자의 사건은 합산하지 않는다', () => {
  const mixed = [...reads(100, { sub: 'learner_a' }), ...reads(100, { sub: 'learner_b' }), ...reads(130, { sub: 'learner_c' })];
  assert.equal(detect(mixed).subject, 'learner_c');
  assert.deepEqual(detect([...reads(100, { sub: 'learner_a' }), ...reads(100, { sub: 'learner_b' })]), { action: 'observe' });
});

test('배열이 아니면 거부한다', () => {
  assert.throws(() => detect(null), /invalid_detection_events/u);
});
