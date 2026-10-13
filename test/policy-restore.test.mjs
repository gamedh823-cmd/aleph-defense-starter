import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { diffPolicy, isSame, policyHash, verifySnapshot } from '../scripts/policy-restore.mjs';
import { RULE_IDS } from '../src/decider.mjs';

const raw = readFileSync(new URL('../policy/safe-policy.v1.json', import.meta.url), 'utf8');
const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));

test('검증한 정책 사본은 해시가 맞고 현재 정책과 같다', () => {
  const snapshot = verifySnapshot(raw);
  assert.equal(snapshot.sha256, policyHash(snapshot.policy));
  const diff = diffPolicy(snapshot.policy, { allowedRoutes: config.allowedRoutes, ruleIds: [...RULE_IDS] });
  assert.equal(isSame(diff), true);
});

test('정책이 바뀌면 되살릴 항목과 제거할 항목을 구분해 보여 준다', () => {
  const { policy } = verifySnapshot(raw);
  const tampered = { allowedRoutes: [...policy.allowedRoutes.slice(1),
    { service: 'notes', method: 'PUT', pathPattern: '/api/notes/:id', zone: 'my-notes' }], ruleIds: policy.ruleIds.slice(0, -1) };
  const diff = diffPolicy(policy, tampered);
  assert.equal(diff.routes.missing.length, 1);
  assert.equal(diff.routes.extra.length, 1);
  assert.deepEqual(diff.rules.missing, [policy.ruleIds.at(-1)]);
  assert.equal(isSame(diff), false);
});

test('사본이 깨졌거나 형식이 틀리면 복원을 중단한다', () => {
  assert.throws(() => verifySnapshot('{'), /읽을 수 없습니다/u);
  assert.throws(() => verifySnapshot('{"version":2}'), /형식/u);
  const forged = JSON.parse(raw);
  forged.policy.allowedRoutes.push('PUT /api/notes/:id');
  assert.throws(() => verifySnapshot(JSON.stringify(forged)), /해시 검증/u);
});
