import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createWarRoomApi, summarize } from '../src/warroom-api.mjs';
import { RULE_IDS } from '../src/decider.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const records = (extra = {}) => ({ memos: 4, backups: 5, approvals: [{ status: 'approved' }],
  audit: [{ action: 'restore', at: '2026-10-13T06:00:00.000Z' }, { action: 'restore_refused', at: '2026-10-13T05:00:00.000Z' }, { action: 'restore', at: '2026-10-13T04:00:00.000Z' }], ...extra });

function call(handler, request) {
  return new Promise((resolve) => {
    const response = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { resolve({ status: this.code, body }); return this; } };
    handler({ headers: {}, method: 'GET', ...request }, response);
  });
}

test('요약의 숫자는 서버 기록을 그대로 집계하고 코드·서버·미실행을 구분한다', () => {
  const data = summarize(records(), new Date('2026-10-13T07:30:00Z'));
  assert.deepEqual(data.rules.decider, [...RULE_IDS]);
  assert.deepEqual([data.restore.memos, data.restore.backups, data.restore.restoresRecorded, data.restore.refusalsRecorded], [4, 5, 2, 1]);
  assert.equal(data.restore.lastRestoreAt, '2026-10-13T06:00:00.000Z');
  assert.equal(data.restore.backupCoversMemos, true);
  assert.equal(summarize(records({ backups: 3 })).restore.backupCoversMemos, false);
  assert.equal(data.device.state, 'approved');
  assert.deepEqual([data.rules.source, data.restore.source, data.device.source], ['code', 'server', 'server']);
  assert.match(data.detection.liveEvents, /^미실행/u);
  assert.match(data.revocation.enforced, /^미실행/u);
});

test('요약에는 메모 본문·토큰·키가 없다', () => {
  const dirty = records({ audit: [{ action: 'restore', at: 'x', title: '비밀 제목', body: '비밀 본문', token: 'secret-token' }] });
  const text = JSON.stringify(summarize(dirty));
  for (const word of ['비밀 제목', '비밀 본문', 'secret-token']) assert.equal(text.includes(word), false, word);
});

test('로그인 없이는 거부하고 GET만 받으며 본인 기록만 읽는다', async () => {
  const asked = [];
  const verify = async (authorization) => (authorization === 'Bearer a' ? { userId: A } : null);
  const handler = createWarRoomApi({ verify, db: { async warRoomRecords(userId) { asked.push(userId); return records(); } } });
  assert.equal((await call(handler, {})).status, 401);
  assert.equal((await call(handler, { method: 'POST', headers: { authorization: 'Bearer a' } })).status, 405);
  const ok = await call(handler, { headers: { authorization: 'Bearer a' } });
  assert.equal(ok.status, 200);
  assert.deepEqual(asked, [A]);
});

test('저장소에 올라간 화면은 웹 저장소를 쓰지 않는다', () => {
  const html = readFileSync(new URL('../public/war-room.html', import.meta.url), 'utf8');
  for (const word of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie']) assert.equal(html.includes(word), false, word);
  assert.match(html, /미실행/u);
});
