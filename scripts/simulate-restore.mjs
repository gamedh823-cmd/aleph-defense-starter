// 10단계: 복구 로직을 메모리 DB에서 직접 실행해 보는 모의 실행(배포 요청이 아님). 제출 묶음 점검(src/attack-check.mjs)에는 넣지 않고 시험만 씁니다.
import { contentHash, createRestoreApi } from '../src/restore.mjs';

export async function simulateRestore() {
  const { info, warn } = console;
  console.info = () => {}; console.warn = () => {};
  try { return await runSimulation(); } finally { console.info = info; console.warn = warn; }
}

async function runSimulation() {
  const B = '22222222-2222-4222-8222-222222222222';
  const [M1, M2] = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'];
  const memo = (id, title, body) => ({ id, owner_id: B, title, body, zone: 'memo' });
  const rows = new Map([[M1, memo(M1, '원본', '가상 원본')], [M2, memo(M2, '다른 메모', '가상 다른 메모')]]);
  const backups = new Map([...rows.values()].map(r => [r.id, { memo_id: r.id, owner_id: B, title: r.title, body: r.body,
    content_sha256: contentHash(r) }]));
  const audit = [{ action: 'earlier' }];
  const restore = createRestoreApi({
    verify: async () => ({ userId: B }),
    db: { getBackup: async id => backups.get(id) ?? null, getRow: async id => (rows.has(id) ? { ...rows.get(id) } : null),
      restoreMemo: async row => { rows.set(row.id, { ...row, zone: 'memo' }); },
      audit: async entry => { audit.push(entry); return { id: audit.length }; } },
  });
  const call = (request) => new Promise((resolve) => {
    restore({ method: 'POST', headers: { authorization: 'Bearer local' }, query: {}, ...request },
      { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { resolve({ status: this.code, body }); } });
  });
  const other = { ...rows.get(M2) };
  rows.get(M1).title = '변조'; rows.get(M1).body = '변조된 내용';
  const refused = await call({ query: { id: M1 }, body: { contentSha256: 'f'.repeat(64) } });
  const stayed = rows.get(M1).title === '변조';
  const done = await call({ query: { id: M1 } });
  rows.delete(M1);
  const again = await call({ query: { id: M1 } });
  return {
    refusedMismatch: refused.status === 409 && stayed,
    restoredTampered: done.status === 200 && done.body.restored === true,
    restoredDeleted: again.status === 200 && again.body.restored === true,
    sameAsBackup: contentHash(rows.get(M1)) === backups.get(M1).content_sha256,
    othersKept: JSON.stringify(rows.get(M2)) === JSON.stringify(other) && rows.size === 2,
    auditKept: audit[0].action === 'earlier' && audit.filter(entry => entry.action === 'restore').length === 2
      && audit.some(entry => entry.action === 'restore_refused'),
  };
}
