import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authChecks, notRun, render } from '../scripts/replay-matrix.mjs';
import { createNotesApi } from '../src/notes-api.mjs';
import { contentHash, createRestoreApi } from '../src/restore.mjs';
import { createWarRoomApi } from '../src/warroom-api.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

// 실제 서버 처리부(notes-api·restore·warroom-api)를 메모리 DB에 연결한 가짜 서버입니다. 메모가 만들어질 때 사본을 남기는 DB 트리거도 흉내 냅니다.
function server({ breakRestore = false } = {}) {
  const rows = new Map();
  const backups = new Map();
  const audit = [];
  const pick = ({ id, title, body }) => ({ id, title, body });
  const db = {
    async list(owner) { return [...rows.values()].filter(r => r.owner_id === owner && r.zone === 'memo').map(pick); },
    async insert(row) { rows.set(row.id, { zone: 'memo', ...row }); backups.set(row.id, { memo_id: row.id, owner_id: row.owner_id, title: row.title, body: row.body, content_sha256: contentHash(row) }); return 'created'; },
    async getRow(id) { const r = rows.get(id); return r ? { ...r } : null; },
    async isInstructor() { return false; },
    async updateNotice() { return null; },
    async update(id, owner, fields) { const r = rows.get(id); if (!r || r.owner_id !== owner) return null; Object.assign(r, fields); return pick(r); },
    async remove(id, owner) { const r = rows.get(id); if (!r || r.owner_id !== owner) return false; return rows.delete(id); },
    async listNotices() { return []; },
    async getBackup(id) { return backups.get(id) ?? null; },
    async restoreMemo(row) { if (!breakRestore) rows.set(row.id, { ...row, zone: 'memo' }); },
    async audit(entry) { audit.push({ ...entry, at: new Date().toISOString() }); return { id: audit.length }; },
    async warRoomRecords(userId) {
      return { memos: [...rows.values()].filter(r => r.owner_id === userId).length, backups: [...backups.values()].filter(r => r.owner_id === userId).length,
        audit: audit.filter(e => e.owner_id === userId), approvals: [] };
    },
  };
  const verify = async (authorization) => ({ 'Bearer token-a': { userId: A }, 'Bearer token-b': { userId: B } })[authorization] ?? null;
  const notes = createNotesApi({ verify, db });
  const restore = createRestoreApi({ verify, db });
  const warRoom = createWarRoomApi({ verify, db });
  const fetcher = async (url, options) => {
    const { pathname } = new URL(url);
    const body = options.body ? JSON.parse(options.body) : undefined;
    const request = { method: options.method, headers: Object.fromEntries(Object.entries(options.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])), query: {}, body };
    let handler;
    if (pathname === '/api/auth/login') {
      const token = { 'a@x.test': 'token-a', 'b@x.test': 'token-b' }[body.email];
      return new Response(JSON.stringify(token ? { access_token: token } : { error: 'bad' }), { status: token ? 200 : 401, headers: { 'x-vercel-id': 'test::login' } });
    }
    const item = /^\/api\/notes\/([^/]+)$/u.exec(pathname);
    const restorePath = /^\/api\/restore\/([^/]+)$/u.exec(pathname);
    if (item) { request.query.id = item[1]; handler = notes.item; }
    else if (restorePath) { request.query.id = restorePath[1]; handler = restore; }
    else if (pathname === '/api/notes') handler = notes.collection;
    else if (pathname === '/api/my/notes') handler = notes.myNotes;
    else if (pathname === '/api/warroom/summary') handler = warRoom;
    else return new Response('{}', { status: 404 });
    return new Promise((resolve) => {
      const response = { setHeader() {}, status(code) { this.code = code; return this; },
        json(payload) { resolve(new Response(JSON.stringify(payload), { status: this.code, headers: { 'x-vercel-id': `test::${pathname}` } })); return this; } };
      handler(request, response);
    });
  };
  return { fetcher, rows };
}

const base = new URL('https://example.vercel.app');
const accounts = { a: { email: 'a@x.test', password: 'unused' }, b: { email: 'b@x.test', password: 'unused' } };

test('계정 A·B로 실제 처리부를 거치면 모든 실측 점검이 통과하고 시험 메모는 지워진다', async () => {
  const { fetcher, rows } = server();
  const result = await authChecks({ base, accounts, fetcher });
  assert.ok(result.length >= 10);
  assert.deepEqual(result.filter(row => row.result !== 'pass'), []);
  assert.ok(result.every(row => row.requestId.startsWith('test::') && row.checkedAt));
  assert.equal(rows.size, 0);
  const ids = result.map(row => row.id);
  for (const id of ['own_memo_allowed', 'other_memo_read_denied', 'other_memo_edit_denied', 'other_memo_restore_denied', 'restore_bad_hash_refused', 'restore_one_memo', 'restore_audit_recorded', 'warroom_matches']) {
    assert.ok(ids.includes(id), id);
  }
});

test('A만 있으면 B 시험은 보내지 않고 미실행으로 남는다', async () => {
  const { fetcher } = server();
  const result = await authChecks({ base, accounts: { a: accounts.a }, fetcher });
  assert.deepEqual(result.filter(row => row.result !== 'pass'), []);
  assert.equal(result.some(row => row.id.startsWith('other_')), false);
  const skipped = notRun({ withA: true, withB: false }).map(row => row.id);
  assert.ok(skipped.includes('other_memo_denied') && !skipped.includes('restore_one_memo') && !skipped.includes('own_memo_allowed'));
});

test('복구가 실제로 되돌리지 못하면 fail로 기록하고 로그인하지 못하면 즉시 멈춘다', async () => {
  const broken = await authChecks({ base, accounts: { a: accounts.a }, fetcher: server({ breakRestore: true }).fetcher });
  assert.equal(broken.find(row => row.id === 'restore_one_memo').result, 'fail');
  const noLogin = await authChecks({ base, accounts: { a: { email: 'nobody@x.test', password: 'x' } }, fetcher: server().fetcher });
  assert.deepEqual(noLogin.map(row => [row.id, row.result]), [['login_a', 'fail']]);
  assert.match(noLogin[0].actual, /HTTP 401 · bad/u); // 이유(상태 코드·서버 오류 이름)는 남고
  assert.equal(JSON.stringify(noLogin).includes('nobody@x.test'), false); // 계정 정보는 남지 않는다
});

test('표에는 계정 정보나 토큰이 나오지 않는다', async () => {
  const { fetcher } = server();
  const result = await authChecks({ base, accounts: { a: { email: 'a@x.test', password: 'secret-pass' } }, fetcher });
  const table = render(result, 'now');
  for (const word of ['secret-pass', 'a@x.test', 'token-a']) assert.equal(table.includes(word), false, word);
});
