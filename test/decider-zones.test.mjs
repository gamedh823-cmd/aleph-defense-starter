import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { decide, RULE_IDS, ZONE_ROUTES } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';

const base = () => fixtureRequests().normal;
const ask = (change) => decide({ ...base(), ...change });
const ID = '11111111-1111-4111-8111-111111111111';

test('심판이 읽는 allowedRoutes와 판정기의 구역 표가 똑같다', () => {
  const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.allowedRoutes, ZONE_ROUTES.map(route => ({ ...route })));
  assert.ok(config.allowedRoutes.every(route => route.method === 'GET' && route.zone), '쓰기 경로와 구역 없는 경로는 선언하지 않는다');
  assert.ok(!config.allowedRoutes.some(route => route.pathPattern === '/api/notes'), '전체 목록 경로는 선언하지 않는다');
});

test('구역이 붙은 읽기 경로의 정상 요청은 허용된다', async () => {
  for (const [route, path] of [
    ['GET /my/notes', '/my/notes'], ['GET /api/my/notes', '/api/my/notes'],
    ['GET /notes/:id', `/notes/${ID}`], ['GET /api/notes/:id', `/api/notes/${ID}`],
    ['GET /notes/:id', '/notes/demo'], ['GET /notices', '/notices'], ['GET /api/notices', '/api/notices'],
  ]) {
    const result = await ask({ method: 'GET', route, path });
    assert.equal(result.decision, 'allow', route);
  }
});

test('전체 목록·쓰기·알 수 없는 경로·기능 경로·쿼리는 거부된다', async () => {
  const cases = [
    { route: 'GET /notes', path: '/notes' },
    { route: 'GET /api/notes', path: '/api/notes' },
    { route: 'POST /notes', method: 'POST', path: '/notes' },
    { route: 'PUT /notes/:id', method: 'PUT', path: `/notes/${ID}` },
    { route: 'DELETE /notes/:id', method: 'DELETE', path: `/notes/${ID}` },
    { route: 'PUT /notices/:id', method: 'PUT', path: '/notices/x' },
    { route: 'POST /notices', method: 'POST', path: '/notices' },
    { route: 'GET /notes/:id', path: '/notes/export' },
    { route: 'GET /admin', path: '/admin' },
    { route: 'GET /notes/:id', path: '/notes/a/b' },
    { route: 'GET /notes/:id', path: '/notes/demo', queryLength: 12 },
    { route: 'GET /my/notes', path: '/my/notes', queryLength: 8 },
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
  const a = { subjectId: 'learner_a', method: 'GET', route: 'GET /notes/:id' };
  assert.equal((await ask({ ...a, path: '/notes/memo-learner_a-1' })).decision, 'allow');
  assert.equal((await ask({ ...a, path: '/notes/memo-learnera-1' })).decision, 'allow');
  assert.equal((await ask({ ...a, path: '/notes/demo' })).decision, 'allow');
  const result = await ask({ ...a, path: '/notes/memo-learner_b-1' });
  assert.equal(result.decision, 'deny');
  assert.equal(result.reasonCode, 'zone_forbidden');
  assert.deepEqual(result.ruleIds, ['zone_owner']);
});
