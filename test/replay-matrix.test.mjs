import assert from 'node:assert/strict';
import { test } from 'node:test';
import { liveChecks, localChecks, notRun, render, runLive } from '../scripts/replay-matrix.mjs';
import { decide } from '../src/decider.mjs';
import { detect } from '../src/detect.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';

const base = new URL('https://example.vercel.app');
const fakeFetch = (statusFor) => async (url, options) => {
  const path = new URL(url).pathname;
  const status = statusFor(path, options.method);
  const body = path === '/data.json' ? { notes: [] } : status === 401 ? { error: 'LOGIN_REQUIRED' } : { name: 'x' };
  return new Response(JSON.stringify(body), { status, headers: { 'x-vercel-id': `icn1::${path}` } });
};

test('실제 응답이 기대와 같을 때만 pass, 다르면 fail이며 요청 ID와 시각이 남는다', async () => {
  const checks = liveChecks(base).filter(item => item.id === 'no_token_list' || item.id === 'static_data_empty');
  const good = await runLive(checks, { fetcher: fakeFetch((path) => (path === '/api/notes' ? 401 : 200)), now: () => new Date('2026-10-13T00:00:00Z') });
  assert.deepEqual(good.map(row => row.result), ['pass', 'pass']);
  assert.ok(good.every(row => row.requestId.startsWith('icn1::') && row.checkedAt === '2026-10-13T00:00:00.000Z'));
  const bad = await runLive(checks, { fetcher: fakeFetch(() => 200) });
  assert.equal(bad.find(row => row.id === 'no_token_list').result, 'fail');
  const down = await runLive(checks, { fetcher: async () => { throw new Error('boom'); } });
  assert.ok(down.every(row => row.result === 'fail' && row.requestId === '없음'));
});

test('판정기·탐지는 로컬에서 실제로 실행되고 모두 기대와 같다', async () => {
  const rows = await localChecks({ decide, detect, fixtureRequests });
  assert.ok(rows.length >= 8);
  assert.ok(rows.every(row => row.result === 'pass' && row.kind === 'local' && row.requestId === 'local'), JSON.stringify(rows.filter(row => row.result !== 'pass')));
});

test('토큰이 필요한 시험은 통과로 처리하지 않고 미실행으로 남는다', () => {
  const rows = notRun();
  assert.ok(rows.every(row => row.kind === '미실행' && row.result === undefined && row.reason));
  const table = render(rows, '2026-10-13T00:00:00Z');
  assert.equal(table.includes('| pass |'), false);
  assert.match(table, /41종 시험 전체가 아니며/u);
});
