import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runAttackChecks } from '../src/attack-check.mjs';

const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));

// 배포 요청 대신 가짜 응답을 돌려 항목 개수·형식만 봅니다(제출 묶음은 점검 1~20개, 항목 이름 3개, 글자 수 제한이 있습니다).
function withFakeFetch(run) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = new URL(url).pathname;
    if (path === '/manifest.webmanifest') return new Response(JSON.stringify({ name: 'x', display: 'standalone', start_url: '/' }), { status: 200 });
    if (path === '/data.json' || path === '/') return new Response(JSON.stringify({ notes: [] }), { status: 200 });
    return new Response(JSON.stringify({ error: 'LOGIN_REQUIRED' }), { status: 401 });
  };
  return run().finally(() => { globalThis.fetch = real; });
}

test('모든 단계에서 직접 점검은 1~20개이고 ID가 겹치지 않으며 형식이 맞다', async () => {
  for (let step = 1; step <= 12; step += 1) {
    const attempts = await withFakeFetch(() => runAttackChecks({ ...config, step }));
    assert.ok(attempts.length >= 1 && attempts.length <= 20, `${step}단계 점검 ${attempts.length}개`);
    assert.equal(new Set(attempts.map(item => item.attackId)).size, attempts.length, `${step}단계 ID 중복`);
    for (const item of attempts) {
      assert.deepEqual(Object.keys(item).sort(), ['attackId', 'expected', 'observed']);
      assert.match(item.attackId, /^[a-z0-9][a-z0-9_.-]{0,79}$/iu);
      assert.ok(item.expected.length <= 300 && item.observed.length <= 300, `${step}단계 ${item.attackId} 글자 수`);
    }
  }
});

test('실행하지 못한 점검은 미실행으로 남고 통과처럼 쓰지 않는다', async () => {
  const attempts = await withFakeFetch(() => runAttackChecks({ ...config, step: 12 }));
  for (const id of ['full_replay_41', 'restore_one_memo_verified', 'signed_request_tampered', 'unsigned_protected_request']) {
    assert.match(attempts.find(item => item.attackId === id).observed, /^미실행/u, id);
  }
});
