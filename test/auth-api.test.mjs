import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthApi } from '../src/auth-api.mjs';

const session = { access_token: 'a.b.c', refresh_token: 'r', expires_at: 1, email: 'x@y.z' };
const api = createAuthApi({
  signIn: async (email, password) => (password === 'good' ? { session } : { message: 'Invalid login credentials' }),
  refresh: async (token) => (token === 'r' ? { session } : {}),
});

function call(handler, request) {
  return new Promise((resolve) => {
    const response = {
      setHeader() {},
      status(code) { this.code = code; return this; },
      json(body) { resolve({ status: this.code, body }); return this; },
    };
    handler(request, response);
  });
}

test('login returns a session, a reason on failure, and rejects bad input', async () => {
  assert.equal((await call(api.login, { method: 'POST', body: { email: 'e@x.y', password: 'good' } })).status, 200);
  const failed = await call(api.login, { method: 'POST', body: { email: 'e@x.y', password: 'bad' } });
  assert.equal(failed.status, 401);
  assert.equal(failed.body.message, 'Invalid login credentials');
  assert.equal((await call(api.login, { method: 'POST', body: {} })).status, 400);
  assert.equal((await call(api.login, { method: 'GET' })).status, 405);
});

test('refresh renews a valid refresh token and refuses others', async () => {
  assert.equal((await call(api.refresh, { method: 'POST', body: { refresh_token: 'r' } })).status, 200);
  assert.equal((await call(api.refresh, { method: 'POST', body: { refresh_token: 'nope' } })).status, 401);
  assert.equal((await call(api.refresh, { method: 'POST', body: {} })).status, 400);
});
