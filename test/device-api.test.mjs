import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDeviceApi, stateOf } from '../src/device-api.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function setup() {
  const rows = [];
  const db = {
    async listApprovals(userId) { return rows.filter(r => r.user_id === userId).sort((a, b) => b.at - a.at); },
    async createApproval(row) { const made = { ...row, request_id: `req-${rows.length + 1}`, at: rows.length }; rows.push(made); return { request_id: made.request_id }; },
  };
  const verify = async (authorization) => ({ 'Bearer a': { userId: A }, 'Bearer b': { userId: B } })[authorization] ?? null;
  return { rows, ...createDeviceApi({ verify, db }) };
}

function call(handler, request) {
  return new Promise((resolve) => {
    const response = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { resolve({ status: this.code, body }); return this; } };
    handler({ headers: {}, query: {}, method: 'GET', ...request }, response);
  });
}

test('로그인 없이는 승인 상태도 요청도 거부된다', async () => {
  const { status, requestApproval } = setup();
  assert.equal((await call(status, {})).status, 401);
  assert.equal((await call(requestApproval, { method: 'POST' })).status, 401);
  assert.equal((await call(status, { method: 'POST', headers: { authorization: 'Bearer a' } })).status, 405);
  assert.equal((await call(requestApproval, { headers: { authorization: 'Bearer a' } })).status, 405);
});

test('승인 요청은 대기 기록만 만들고 스스로 승인되지 않는다', async () => {
  const { rows, status, requestApproval } = setup();
  const a = { authorization: 'Bearer a' };
  assert.equal((await call(status, { headers: a })).body.state, 'none');
  const made = await call(requestApproval, { method: 'POST', headers: a, body: { label: '내 노트북', status: 'approved', state: 'approved' } });
  assert.equal(made.status, 201);
  assert.equal(made.body.state, 'pending');
  assert.equal(rows[0].status, 'pending'); // 본문의 status·state는 쓰지 않는다
  assert.equal((await call(status, { headers: a })).body.state, 'pending');
  const again = await call(requestApproval, { method: 'POST', headers: a, body: {} });
  assert.equal(again.body.created, false);
  assert.equal(rows.length, 1); // 대기 중이면 새로 만들지 않는다
});

test('승인은 서버 쪽 기록이 바꿔야만 approved가 되고 다른 사용자에게 번지지 않는다', async () => {
  const { rows, status, requestApproval } = setup();
  await call(requestApproval, { method: 'POST', headers: { authorization: 'Bearer a' }, body: {} });
  rows[0].status = 'approved'; // 운영자가 DB에서 승인한 것
  assert.equal((await call(status, { headers: { authorization: 'Bearer a' } })).body.state, 'approved');
  assert.equal((await call(status, { headers: { authorization: 'Bearer b' } })).body.state, 'none');
  rows[0].status = 'revoked'; // 회수
  assert.equal((await call(status, { headers: { authorization: 'Bearer a' } })).body.state, 'none');
});

test('이름표는 정리되고 기기 키·토큰으로 보이는 입력은 저장하지 않는다', async () => {
  const { rows, requestApproval } = setup();
  await call(requestApproval, { method: 'POST', headers: { authorization: 'Bearer a' }, body: { label: '<script>x</script> 노트북' + 'a'.repeat(100), privateKey: 'k', token: 't' } });
  assert.ok(rows[0].label.length <= 60);
  assert.equal(/[<>]/u.test(rows[0].label), false);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['at', 'label', 'request_id', 'status', 'user_id']);
});

test('상태 계산: 승인이 있으면 approved, 대기만 있으면 pending', () => {
  assert.equal(stateOf([]), 'none');
  assert.equal(stateOf([{ status: 'pending' }]), 'pending');
  assert.equal(stateOf([{ status: 'revoked' }, { status: 'pending' }]), 'pending');
  assert.equal(stateOf([{ status: 'pending' }, { status: 'approved' }]), 'approved');
});
