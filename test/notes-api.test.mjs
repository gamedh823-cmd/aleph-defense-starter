import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNotesApi } from '../src/notes-api.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const C = '33333333-3333-4333-8333-333333333333'; // 저장된 강사
const NOTICE = '44444444-4444-4444-8444-444444444444';

// 실제 DB처럼 zone 기본값은 memo이고, 구역·강사 권한은 저장된 값만 씁니다.
function memoryDb() {
  const rows = new Map([[NOTICE, { id: NOTICE, title: '공지', body: '가상 강사 공지', owner_id: C, zone: 'notice' }]]);
  const pick = ({ id, title, body }) => ({ id, title, body });
  return {
    async list(owner) { return [...rows.values()].filter(r => r.owner_id === owner && r.zone === 'memo').map(pick); },
    async insert(row) { if (rows.has(row.id)) return 'duplicate'; rows.set(row.id, { zone: 'memo', ...row }); return 'created'; },
    async getRow(id) { const r = rows.get(id); return r ? { ...r } : null; },
    async isInstructor(userId) { return userId === C; },
    async updateNotice(id, fields) { const r = rows.get(id); if (!r || r.zone !== 'notice') return null; Object.assign(r, fields); return pick(r); },
    async update(id, owner, fields) { const r = rows.get(id); if (!r || r.owner_id !== owner || r.zone !== 'memo') return null; Object.assign(r, fields); return pick(r); },
    async remove(id, owner) { const r = rows.get(id); if (!r || r.owner_id !== owner || r.zone !== 'memo') return false; return rows.delete(id); },
  };
}

function api() {
  const verify = async (authorization) => {
    if (authorization === 'Bearer a') return { kind: 'student', userId: A };
    if (authorization === 'Bearer b') return { kind: 'student', userId: B };
    if (authorization === 'Bearer c') return { kind: 'student', userId: C };
    return null;
  };
  return createNotesApi({ verify, db: memoryDb() });
}

function call(handler, request) {
  return new Promise((resolve) => {
    const headers = {};
    const response = {
      setHeader(key, value) { headers[key] = value; },
      status(code) { this.code = code; return this; },
      json(body) { resolve({ status: this.code, body, headers }); return this; },
    };
    handler({ headers: {}, query: {}, ...request }, response);
  });
}

test('requests without a valid login are refused with a JSON error', async () => {
  const { collection, item } = api();
  for (const authorization of [undefined, 'Bearer x']) {
    const list = await call(collection, { method: 'GET', headers: { authorization } });
    assert.equal(list.status, 401);
    assert.equal(list.body.error, 'LOGIN_REQUIRED');
    const add = await call(collection, { method: 'POST', headers: { authorization }, body: { title: 't' } });
    assert.equal(add.status, 401);
    const one = await call(item, { method: 'GET', headers: { authorization }, query: { id: A } });
    assert.equal(one.status, 401);
  }
});

test('a logged-in user adds, lists, edits and deletes notes', async () => {
  const { collection, item } = api();
  const headers = { authorization: 'Bearer a' };
  const created = await call(collection, { method: 'POST', headers, body: { title: '제목', body: '내용' } });
  assert.equal(created.status, 201);
  const { id } = created.body;
  assert.match(id, /^[0-9a-f-]{36}$/u);
  assert.deepEqual((await call(collection, { method: 'GET', headers })).body, [{ id, title: '제목', body: '내용' }]);
  assert.deepEqual((await call(collection, { method: 'GET', headers: { authorization: 'Bearer b' } })).body, []);
  assert.deepEqual((await call(item, { method: 'GET', headers, query: { id } })).body, { id, title: '제목', body: '내용' });
  const edited = await call(item, { method: 'PUT', headers, query: { id }, body: { title: '새 제목' } });
  assert.equal(edited.body.title, '새 제목');
  assert.equal((await call(item, { method: 'DELETE', headers, query: { id } })).status, 200);
  assert.equal((await call(item, { method: 'GET', headers, query: { id } })).status, 404);
});

test('invalid input, duplicate ids and bad methods are rejected', async () => {
  const { collection, item } = api();
  const headers = { authorization: 'Bearer a' };
  assert.equal((await call(collection, { method: 'POST', headers, body: { title: '' } })).status, 400);
  assert.equal((await call(collection, { method: 'POST', headers, body: { title: 't', id: 'not-a-uuid' } })).status, 400);
  const first = await call(collection, { method: 'POST', headers, body: { id: B, title: 't', body: '' } });
  assert.equal(first.status, 201);
  assert.equal((await call(collection, { method: 'POST', headers, body: { id: B, title: 't' } })).status, 409);
  assert.equal((await call(item, { method: 'GET', headers, query: { id: 'zzz' } })).status, 404);
  assert.equal((await call(collection, { method: 'PATCH', headers })).status, 405);
});

test('a logged-in user cannot read, edit, delete or take over another user note', async () => {
  const { collection, item } = api();
  const a = { authorization: 'Bearer a' };
  const b = { authorization: 'Bearer b' };
  const { body: { id } } = await call(collection, { method: 'POST', headers: a, body: { title: 'A의 메모', body: '비공개' } });
  assert.equal((await call(item, { method: 'GET', headers: b, query: { id } })).status, 404);
  assert.equal((await call(item, { method: 'PUT', headers: b, query: { id }, body: { title: '탈취' } })).status, 404);
  assert.equal((await call(item, { method: 'DELETE', headers: b, query: { id } })).status, 404);
  assert.equal((await call(item, { method: 'PUT', headers: a, query: { id }, body: { title: 't', owner_id: B } })).status, 403);
  // 본문에 남의 owner_id를 실어 추가해도 서버가 확인한 사용자 ID로 저장됩니다.
  const forged = await call(collection, { method: 'POST', headers: b, body: { title: 'B', owner_id: A } });
  assert.equal(forged.status, 201);
  assert.deepEqual((await call(collection, { method: 'GET', headers: a })).body.map(n => n.title), ['A의 메모']);
  assert.deepEqual((await call(item, { method: 'GET', headers: a, query: { id } })).body.title, 'A의 메모');
});

test('8단계: 강사 공지는 읽기만 열리고, 수정은 저장된 강사만, 삭제는 아무도 못 한다', async () => {
  const { collection, item } = api();
  const a = { authorization: 'Bearer a' };
  const c = { authorization: 'Bearer c' };
  assert.equal((await call(item, { method: 'GET', headers: a, query: { id: NOTICE } })).body.title, '공지');
  // 일반 학생은 본문에 role·zone을 실어도 공지를 고치거나 지울 수 없다.
  const forged = await call(item, { method: 'PUT', headers: a, query: { id: NOTICE }, body: { title: '조작', role: 'instructor', zone: 'memo' } });
  assert.equal(forged.status, 403);
  assert.equal(forged.body.error, 'FORBIDDEN_ZONE');
  assert.equal((await call(item, { method: 'DELETE', headers: a, query: { id: NOTICE } })).status, 403);
  assert.equal((await call(item, { method: 'DELETE', headers: c, query: { id: NOTICE } })).status, 403);
  // 저장된 강사는 공지를 고칠 수 있다.
  const edited = await call(item, { method: 'PUT', headers: c, query: { id: NOTICE }, body: { title: '새 공지' } });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.title, '새 공지');
  // 공지는 학생 메모 목록에 섞이지 않는다.
  assert.deepEqual((await call(collection, { method: 'GET', headers: c })).body, []);
});

test('8단계: 직접 API 요청으로도 다른 구역 자료는 나오지 않는다', async () => {
  const { collection, item } = api();
  const a = { authorization: 'Bearer a' };
  const b = { authorization: 'Bearer b' };
  const { body: { id } } = await call(collection, { method: 'POST', headers: a, body: { title: 'A 메모', body: '비공개' } });
  assert.equal((await call(item, { method: 'GET', headers: b, query: { id } })).status, 404);
  assert.equal((await call(item, { method: 'PUT', headers: b, query: { id }, body: { title: 'x', role: 'instructor' } })).status, 404);
  assert.deepEqual((await call(collection, { method: 'GET', headers: b })).body, []);
  assert.equal((await call(item, { method: 'GET', headers: a, query: { id } })).body.title, 'A 메모');
});
