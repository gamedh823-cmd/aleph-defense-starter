import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide, RULE_IDS } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';

const base = () => fixtureRequests().normal;
const ask = (change) => decide({ ...base(), ...change });

test('정확한 자료 경로의 정상 요청은 허용된다', async () => {
  for (const [method, route, path] of [
    ['GET', 'GET /notes', '/notes'], ['POST', 'POST /notes', '/notes'],
    ['GET', 'GET /notes/:id', '/notes/11111111-1111-4111-8111-111111111111'],
    ['PUT', 'PUT /notes/:id', '/notes/11111111-1111-4111-8111-111111111111'],
    ['DELETE', 'DELETE /notes/:id', '/notes/11111111-1111-4111-8111-111111111111'],
    ['GET', 'GET /api/notes/:id', '/api/notes/11111111-1111-4111-8111-111111111111'],
  ]) {
    const result = await ask({ method, route, path });
    assert.equal(result.decision, 'allow', route);
  }
});

test('알 수 없는 경로·기능 경로·쿼리는 거부된다', async () => {
  const cases = [
    { route: 'GET /notices/:id', path: '/notices/x' },
    { route: 'PUT /notices/:id', method: 'PUT', path: '/notices/x' },
    { route: 'GET /notes/:id', path: '/notes/export' },
    { route: 'GET /admin', path: '/admin' },
    { route: 'GET /notes/:id', path: '/notes/a/b' },
    { route: 'GET /notes/:id', path: '/notes/demo', queryLength: 12 },
    { route: 'GET /notes/:id', method: 'PUT', path: '/notes/demo' },
    { route: undefined },
  ];
  for (const change of cases) {
    const result = await ask(change);
    assert.equal(result.decision, 'deny', JSON.stringify(change));
    assert.equal(result.reasonCode, 'route_not_allowed');
    assert.deepEqual(result.ruleIds, ['zone_routes']);
  }
});

test('미등록 기기는 경로와 상관없이 기존 규칙으로 거부된다', async () => {
  const result = await ask({ deviceRegistered: false });
  assert.equal(result.reasonCode, 'device_not_registered');
  assert.ok(RULE_IDS.includes('zone_routes') && RULE_IDS.includes('step_up_required'));
});

test('다른 사용자 표시가 붙은 자료는 거부, 본인·표시 없는 자료는 허용된다', async () => {
  const a = { subjectId: 'learner_a' };
  assert.equal((await ask({ ...a, path: '/notes/memo-learner_a-1' })).decision, 'allow');
  assert.equal((await ask({ ...a, path: '/notes/memo-learnera-1' })).decision, 'allow');
  assert.equal((await ask({ ...a, path: '/notes/demo' })).decision, 'allow');
  for (const [method, path] of [['GET', '/notes/memo-learner_b-1'], ['PUT', '/notes/memo-learner_b-1'], ['DELETE', '/notes/memo-user_b-1']]) {
    const route = `${method} /notes/:id`;
    const result = await ask({ ...a, method, route, path });
    assert.equal(result.decision, 'deny', path);
    assert.equal(result.reasonCode, 'zone_forbidden');
    assert.deepEqual(result.ruleIds, ['zone_owner']);
  }
});

test('강사 공지는 학생이 읽기만 되고 수정·삭제는 거부된다', async () => {
  assert.equal((await ask({ path: '/notes/notice-1' })).decision, 'allow');
  for (const method of ['PUT', 'DELETE']) {
    const result = await ask({ method, route: `${method} /notes/:id`, path: '/notes/notice-1' });
    assert.equal(result.decision, 'deny');
    assert.equal(result.reasonCode, 'zone_forbidden');
  }
});
