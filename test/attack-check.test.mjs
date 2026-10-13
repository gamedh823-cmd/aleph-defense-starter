import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runAttackChecks } from '../src/attack-check.mjs';

const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));
const APP = 'https://student-defense.vercel.app/';
const KEYS = 'attackId,expected,observed,result,stage';

// 배포 대신 가짜 서버를 두고, 보낸 요청(메서드·주소·헤더·alephEvidence)을 기록합니다.
async function withServer(respond, run) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ url: String(input), init });
    const { status = 200, body = {} } = respond(new URL(String(input)), init) ?? {};
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  };
  try { return { attempts: await run(), calls }; } finally { globalThis.fetch = real; }
}

const secure = (url) => {
  if (url.pathname === '/data.json') return { body: { notes: [] } };
  if (url.pathname === '/') return { body: '<html>자료실</html>' };
  if (url.pathname.startsWith('/rest/')) return { status: 404, body: { error: 'NOT_FOUND' } };
  if (url.pathname.startsWith('/api/restore/')) return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
  return { status: 401, body: { error: 'LOGIN_REQUIRED' } };
};

test('결과는 다섯 값뿐이고 20개 이하이며 단계 순서이고 ID가 겹치지 않는다', async () => {
  const { attempts } = await withServer(secure, () => runAttackChecks(APP));
  assert.ok(attempts.length >= 1 && attempts.length <= 20, `${attempts.length}개`);
  assert.equal(new Set(attempts.map(item => item.attackId)).size, attempts.length);
  for (const item of attempts) {
    assert.equal(Object.keys(item).sort().join(','), KEYS);
    assert.match(item.attackId, /^[a-z0-9][a-z0-9_.-]{0,79}$/iu);
    assert.ok(Number.isInteger(item.stage) && item.stage >= 1 && item.stage <= 12);
    assert.ok(['blocked', 'breached', 'not_run'].includes(item.result));
    assert.ok(item.expected.length > 0 && item.expected.length <= 300);
  }
  assert.deepEqual(attempts.map(item => item.stage), [...attempts.map(item => item.stage)].sort((a, b) => a - b));
});

test('observed에는 심판이 요청 기록과 대조할 수 있는 사실(HTTP 상태, network_error, not_run)만 있다', async () => {
  const { attempts } = await withServer(secure, () => runAttackChecks(APP));
  for (const item of attempts) assert.match(item.observed, /^(HTTP \d{3}|network_error|not_run)$/u, `${item.attackId}: ${item.observed}`);
});

test('요청은 GET만 24건 이하이고, 점검 하나에 요청 하나가 alephEvidence로 연결된다', async () => {
  const { attempts, calls } = await withServer(secure, () => runAttackChecks(APP));
  assert.ok(calls.length >= 1 && calls.length <= 24);
  assert.ok(calls.every(({ init }) => ['GET', 'HEAD'].includes(init.method ?? 'GET')));
  const keys = calls.map(({ init }) => init.alephEvidence.requestKey);
  assert.equal(new Set(keys).size, keys.length); // 요청 이름은 요청마다 새로 만든다
  assert.ok(keys.every(key => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(key)));
  const caseIds = calls.map(({ init }) => init.alephEvidence.caseId);
  assert.equal(new Set(caseIds).size, caseIds.length); // 점검 하나에 요청 하나
  const sent = attempts.filter(item => item.observed !== 'not_run').map(item => item.attackId).sort();
  assert.deepEqual([...caseIds].sort(), sent); // 요청이 있는 점검 = not_run이 아닌 점검
  // 요청 헤더나 주소에는 표식을 넣지 않는다.
  assert.ok(calls.every(({ url, init }) => !/attackId/iu.test(url) && !JSON.stringify(init.headers ?? {}).toLowerCase().includes('attack')));
});

test('요청을 보내지 않은 점검은 observed와 result가 not_run이고 결과 표현이 없다', async () => {
  const { attempts } = await withServer(secure, () => runAttackChecks(APP));
  const notRun = attempts.filter(item => item.result === 'not_run');
  assert.ok(notRun.length >= 1);
  for (const item of notRun) {
    assert.equal(item.observed, 'not_run');
    assert.equal(/통과|막음|막았|차단했|성공/u.test(item.expected), false, item.attackId);
  }
});

test('응답에 따라 blocked·breached·not_run이 정해진다', async () => {
  const secured = (await withServer(secure, () => runAttackChecks(APP))).attempts.filter(item => item.observed !== 'not_run');
  assert.ok(secured.every(item => item.result === 'blocked'), JSON.stringify(secured.filter(item => item.result !== 'blocked')));
  // 보호가 없으면 breached: 로그인 없이 메모가 응답된다.
  const open = (await withServer((url) => (url.pathname === '/api/notes' ? { body: [{ id: 'x', title: '가상', body: '내용' }] } : secure(url)),
    () => runAttackChecks(APP))).attempts;
  assert.equal(open.find(item => item.attackId === 's03_no_token_list').result, 'breached');
  // 서버 오류(5xx)와 연결 실패는 응답을 얻지 못한 것이라 not_run이다.
  const broken = (await withServer(() => ({ status: 502, body: {} }), () => runAttackChecks(APP))).attempts;
  assert.ok(broken.filter(item => item.observed !== 'not_run' || item.attackId.startsWith('s0') || item.attackId.startsWith('s1')).every(item => item.result === 'not_run'));
  const real = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('connection reset'); };
  try {
    const down = await runAttackChecks(APP);
    assert.ok(down.every(item => item.result === 'not_run'));
    assert.ok(down.some(item => item.observed === 'network_error'));
  } finally { globalThis.fetch = real; }
});

test('배포 주소 문자열과 설정 객체를 모두 받고, 잘못된 주소는 거부한다', async () => {
  const fromString = (await withServer(secure, () => runAttackChecks(APP))).attempts;
  const fromConfig = (await withServer(secure, () => runAttackChecks({ ...config, publicAppUrl: APP }))).attempts;
  assert.deepEqual(fromString, fromConfig);
  for (const bad of ['http://x.vercel.app/', 'https://x.example/', 'https://x.vercel.app/path', 'not a url', undefined]) {
    await assert.rejects(() => runAttackChecks(bad), /실제 배포 주소/u);
  }
});

test('점검 파일은 아무것도 불러오지 않고, 쓰기 메서드나 비밀값이 없다', () => {
  const source = readFileSync(new URL('../src/attack-check.mjs', import.meta.url), 'utf8');
  assert.equal(/^\s*import\s/mu.test(source), false);
  assert.equal(/method:\s*['"](?:POST|PUT|PATCH|DELETE)/u.test(source), false);
  assert.equal(/eyJ[A-Za-z0-9_-]{12,}\.eyJ|sb_secret_/u.test(source), false);
});
