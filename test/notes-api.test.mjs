import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNotesApi } from '../src/notes-api.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function memoryDb() {
  const rows = new Map();
  return {
    async list(owner) { return [...rows.values()].filter(r => r.owner_id === owner).map(({ id, title, body }) => ({ id, title, body })); },
    async insert(row) { if (rows.has(row.id)) return 'duplicate'; rows.set(row.id, row); return 'created'; },
    async get(id) { const r = rows.get(id); return r ? { id: r.id, title: r.title, body: r.body } : null; },
    async update(id, fields) { const r = rows.get(id); if (!r) return null; Object.assign(r, fields); return { id, title: r.title, body: r.body }; },
    async remove(id) { return rows.delete(id); },
  };
}

function api() {
  const verify = async (authorization) => {
    if (authorization === 'Bearer a') return { kind: 'student', userId: A };
    if (authorization === 'Bearer b') return { kind: 'student', userId: B };
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
