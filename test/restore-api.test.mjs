import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contentHash, createRestoreApi } from '../src/restore.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const M1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; // B의 메모(복구 대상)
const M2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; // B의 다른 메모
const M3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'; // A의 메모

const backupRow = (id, owner, title, body) => ({ memo_id: id, owner_id: owner, title, body,
  content_sha256: contentHash({ id, owner_id: owner, title, body }) });

function setup() {
  const rows = new Map([
    [M1, { id: M1, owner_id: B, title: '원본', body: '원본 내용', zone: 'memo' }],
    [M2, { id: M2, owner_id: B, title: '다른 메모', body: '그대로', zone: 'memo' }],
    [M3, { id: M3, owner_id: A, title: 'A 메모', body: '비공개', zone: 'memo' }],
  ]);
  const backups = new Map([
    [M1, backupRow(M1, B, '원본', '원본 내용')],
    [M2, backupRow(M2, B, '다른 메모', '그대로')],
    [M3, backupRow(M3, A, 'A 메모', '비공개')],
  ]);
  const audit = [{ action: 'earlier', memo_id: M2 }];
  const db = {
    async getBackup(id) { return backups.get(id) ?? null; },
    async getRow(id) { const r = rows.get(id); return r ? { ...r } : null; },
    async restoreMemo(row) { rows.set(row.id, { ...row, zone: 'memo' }); },
    async audit(entry) { audit.push(entry); return { id: audit.length }; },
  };
  const verify = async (authorization) => ({ 'Bearer a': { userId: A }, 'Bearer b': { userId: B } })[authorization] ?? null;
  return { rows, backups, audit, restore: createRestoreApi({ verify, db }) };
}

function call(handler, request) {
  return new Promise((resolve) => {
    const response = { setHeader() {}, status(code) { this.code = code; return this; },
      json(body) { resolve({ status: this.code, body }); return this; } };
    handler({ headers: {}, query: {}, method: 'POST', ...request }, response);
  });
}

test('로그인 없이는 복구할 수 없고 POST만 받는다', async () => {
  const { restore } = setup();
  assert.equal((await call(restore, { query: { id: M1 } })).status, 401);
  assert.equal((await call(restore, { method: 'GET', headers: { authorization: 'Bearer b' }, query: { id: M1 } })).status, 405);
});

test('변조된 메모 한 건만 사본으로 복원하고 다른 메모·감사 기록은 그대로 둔다', async () => {
  const { rows, audit, restore } = setup();
  rows.get(M1).title = '변조'; rows.get(M1).body = '변조된 내용';
  const before = { m2: { ...rows.get(M2) }, m3: { ...rows.get(M3) } };
  const result = await call(restore, { headers: { authorization: 'Bearer b' }, query: { id: M1 } });
  assert.equal(result.status, 200);
  assert.equal(result.body.restored, true);
  assert.equal(result.body.verified, true);
  assert.equal(result.body.auditRecorded, true);
  assert.deepEqual(result.body.plan.changes, ['title', 'body']);
  assert.equal(JSON.stringify(result.body).includes('원본 내용'), false); // 내용은 응답에 없다
  assert.deepEqual([rows.get(M1).title, rows.get(M1).body, rows.get(M1).owner_id], ['원본', '원본 내용', B]);
  assert.deepEqual(rows.get(M2), before.m2);
  assert.deepEqual(rows.get(M3), before.m3);
  assert.equal(audit[0].action, 'earlier'); // 기존 감사 기록 보존
  assert.equal(audit.at(-1).action, 'restore'); // 복구도 기록으로 남음
  assert.equal(JSON.stringify(audit).includes('원본 내용'), false); // 기록에 메모 내용은 없다
});

test('삭제된 메모도 한 건만 복원되고, 복원된 내용의 해시가 사본과 같다', async () => {
  const { rows, backups, restore } = setup();
  rows.delete(M1);
  const result = await call(restore, { headers: { authorization: 'Bearer b' }, query: { id: M1 } });
  assert.equal(result.body.restored, true);
  assert.equal(contentHash(rows.get(M1)), backups.get(M1).content_sha256);
  assert.equal(rows.size, 3);
});

test('이미 같은 메모는 바꾸지 않는다(멱등)', async () => {
  const { audit, restore } = setup();
  const result = await call(restore, { headers: { authorization: 'Bearer b' }, query: { id: M1 } });
  assert.equal(result.body.restored, false);
  assert.equal(audit.length, 1);
});

test('남의 메모·사본 없는 메모·잘못된 ID는 복원하지 않는다', async () => {
  const { rows, restore } = setup();
  rows.get(M3).title = '변조';
  assert.equal((await call(restore, { headers: { authorization: 'Bearer b' }, query: { id: M3 } })).status, 404);
  assert.equal(rows.get(M3).title, '변조');
  assert.equal((await call(restore, { headers: { authorization: 'Bearer b' }, query: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' } })).status, 404);
  assert.equal((await call(restore, { headers: { authorization: 'Bearer b' }, query: { id: 'not-a-uuid' } })).status, 400);
  assert.equal((await call(restore, { headers: { authorization: 'Bearer b' }, query: { id: M1 }, body: { id: M2 } })).status, 400);
});

test('사본 해시가 맞지 않거나 현재 소유자가 다르면 덮어쓰지 않는다', async () => {
  const bad = setup();
  bad.backups.get(M1).title = '사본 변조';
  bad.rows.get(M1).title = '변조';
  assert.equal((await call(bad.restore, { headers: { authorization: 'Bearer b' }, query: { id: M1 } })).status, 409);
  assert.equal(bad.rows.get(M1).title, '변조');
  const owner = setup();
  owner.rows.get(M1).owner_id = A;
  assert.equal((await call(owner.restore, { headers: { authorization: 'Bearer b' }, query: { id: M1 } })).status, 409);
});

test('경로가 :id 그대로 오면 본문의 id 한 건만 복원한다', async () => {
  const { rows, restore } = setup();
  rows.get(M1).title = '변조';
  const result = await call(restore, { headers: { authorization: 'Bearer b' }, query: { id: ':id' }, body: { id: M1 } });
  assert.equal(result.body.restored, true);
  assert.equal(rows.get(M1).title, '원본');
  assert.equal((await call(restore, { headers: { authorization: 'Bearer b' }, query: { id: ':id' }, body: {} })).status, 400);
});

test('요청이 보낸 소유자·해시·내용이 사본과 다르면 복원하지 않고 거부 기록만 남긴다', async () => {
  const { rows, backups, audit, restore } = setup();
  rows.get(M1).title = '변조';
  const good = backups.get(M1).content_sha256;
  for (const claim of [{ contentSha256: 'f'.repeat(64) }, { owner_id: A }, { title: '변조', body: '변조된 내용' }, { sha256: 'zz' }]) {
    const result = await call(restore, { headers: { authorization: 'Bearer b' }, query: { id: M1 }, body: claim });
    assert.equal(result.status, 409, JSON.stringify(claim));
    assert.equal(result.body.verified, false);
    assert.equal(result.body.restored, false);
    assert.equal(rows.get(M1).title, '변조');
  }
  assert.equal(audit.filter(entry => entry.action === 'restore_refused').length, 4);
  assert.equal(audit[0].action, 'earlier');
  // 사본과 같은 주장은 통과해 복원된다(sha256: 접두와 대문자도 허용).
  const ok = await call(restore, { headers: { authorization: 'Bearer b' }, query: { id: M1 }, body: { contentSha256: 'sha256:' + good.toUpperCase() } });
  assert.equal(ok.body.restored, true);
  assert.equal(rows.get(M1).title, '원본');
});

test('dryRun은 바뀔 항목만 보여 주고 아무것도 바꾸지 않는다', async () => {
  const { rows, audit, restore } = setup();
  rows.get(M1).body = '변조';
  const result = await call(restore, { headers: { authorization: 'Bearer b' }, query: { id: M1 }, body: { dryRun: true } });
  assert.equal(result.status, 200);
  assert.equal(result.body.dryRun, true);
  assert.deepEqual(result.body.plan.changes, ['body']);
  assert.equal(rows.get(M1).body, '변조');
  assert.equal(audit.length, 1);
});

test('제출 묶음용 로컬 모의 복구 점검은 실제로 모두 통과한다', async () => {
  const { simulateRestore } = await import('../scripts/simulate-restore.mjs');
  const result = await simulateRestore();
  assert.deepEqual(result, { refusedMismatch: true, restoredTampered: true, restoredDeleted: true,
    sameAsBackup: true, othersKept: true, auditKept: true });
});
