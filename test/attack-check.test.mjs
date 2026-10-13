import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runAttackChecks } from '../src/attack-check.mjs';

const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));

// 배포 요청 대신 가짜 응답을 돌려 항목 개수·형식만 봅니다. 보낸 요청의 메서드도 기록합니다.
// 제출 묶음은 점검 1~20개, 항목 이름 3개, 글자 수 제한이 있고 심판의 격리 환경에서는 읽기(GET·HEAD) 요청만 보낼 수 있습니다.
async function withFakeFetch(run) {
  const real = globalThis.fetch;
  const methods = [];
  globalThis.fetch = async (url, options = {}) => {
    methods.push(options.method ?? 'GET');
    const path = new URL(url).pathname;
    if (path === '/manifest.webmanifest') return new Response(JSON.stringify({ name: 'x', display: 'standalone', start_url: '/' }), { status: 200 });
    if (path === '/data.json' || path === '/') return new Response(JSON.stringify({ notes: [] }), { status: 200 });
    if (path.startsWith('/api/restore/')) return new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }), { status: 405 });
    return new Response(JSON.stringify({ error: 'LOGIN_REQUIRED' }), { status: 401 });
  };
  try { return { attempts: await run(), methods }; } finally { globalThis.fetch = real; }
}

test('모든 단계에서 직접 점검은 1~20개이고 ID가 겹치지 않으며 형식이 맞다', async () => {
  for (let step = 1; step <= 12; step += 1) {
    const { attempts } = await withFakeFetch(() => runAttackChecks({ ...config, step }));
    assert.ok(attempts.length >= 1 && attempts.length <= 20, `${step}단계 점검 ${attempts.length}개`);
    assert.equal(new Set(attempts.map(item => item.attackId)).size, attempts.length, `${step}단계 ID 중복`);
    for (const item of attempts) {
      assert.deepEqual(Object.keys(item).sort(), ['attackId', 'expected', 'observed']);
      assert.match(item.attackId, /^[a-z0-9][a-z0-9_.-]{0,79}$/iu);
      assert.ok(item.expected.length <= 300 && item.observed.length <= 300, `${step}단계 ${item.attackId} 글자 수`);
    }
  }
});

test('점검은 읽기(GET·HEAD) 요청만 보낸다(쓰기 요청은 격리 환경에서 막힌다)', async () => {
  for (let step = 1; step <= 12; step += 1) {
    const { methods } = await withFakeFetch(() => runAttackChecks({ ...config, step }));
    assert.ok(methods.length > 0);
    assert.deepEqual(methods.filter(method => !['GET', 'HEAD'].includes(method)), [], `${step}단계`);
  }
});

test('실행하지 못한 점검은 observed가 not_run이고 사유는 expected에 남는다', async () => {
  const { attempts } = await withFakeFetch(() => runAttackChecks({ ...config, step: 12 }));
  for (const id of ['full_replay_41', 'restore_one_memo_verified', 'signed_request_tampered', 'unsigned_protected_request']) {
    const item = attempts.find(entry => entry.attackId === id);
    assert.equal(item.observed, 'not_run', id);
    assert.match(item.expected, /미실행 사유/u, id);
  }
  assert.equal(attempts.some(item => item.observed.startsWith('미실행')), false);
  // 실제로 보낸 점검은 not_run이 아니다.
  assert.notEqual(attempts.find(item => item.attackId === 'restore_get_refused').observed, 'not_run');
});
