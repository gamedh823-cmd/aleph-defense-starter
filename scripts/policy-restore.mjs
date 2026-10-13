// 10단계: 검증한 안전 정책 사본(policy/safe-policy.v1.json)과 현재 정책의 차이를 보여 주고, 확인한 뒤에만 되돌립니다.
// 정책 사본 = 심판이 읽는 선언 경로(allowedRoutes)와 판정기 규칙 이름(RULE_IDS). 사본이 없거나 해시 검증에 실패하면 중단합니다.
// 되돌리는 대상은 aleph.config.json의 allowedRoutes 한 항목뿐입니다. 규칙 코드와 다른 설정, 자료·감사 기록은 건드리지 않습니다.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const SNAPSHOT = resolve(root, 'policy', 'safe-policy.v1.json');
const CONFIG = resolve(root, 'aleph.config.json');

export const policyHash = (policy) => createHash('sha256').update(JSON.stringify(policy), 'utf8').digest('hex');
const key = (route) => (typeof route === 'string' ? route : `${route.service} ${route.method} ${route.pathPattern} [${route.zone}]`);

// 사본을 읽고 모양과 해시를 검증합니다. 문제가 있으면 이유와 함께 예외를 던집니다.
export function verifySnapshot(raw) {
  let snapshot;
  try { snapshot = JSON.parse(raw); } catch { throw new Error('정책 사본을 읽을 수 없습니다. 복원을 중단합니다.'); }
  const policy = snapshot?.policy;
  if (snapshot?.version !== 1 || !Array.isArray(policy?.allowedRoutes) || !Array.isArray(policy?.ruleIds)) {
    throw new Error('정책 사본 형식이 맞지 않습니다. 복원을 중단합니다.');
  }
  if (snapshot.sha256 !== policyHash(policy)) throw new Error('정책 사본 해시 검증에 실패했습니다. 복원을 중단합니다.');
  return snapshot;
}

// 사본(safe)과 현재(current)의 차이: 사본에는 있는데 현재 없는 항목(missing), 현재에만 있는 항목(extra).
export function diffPolicy(safe, current) {
  const part = (a, b) => a.filter(item => !b.some(other => key(other) === key(item))).map(key);
  return {
    routes: { missing: part(safe.allowedRoutes, current.allowedRoutes), extra: part(current.allowedRoutes, safe.allowedRoutes) },
    rules: { missing: part(safe.ruleIds, current.ruleIds), extra: part(current.ruleIds, safe.ruleIds) },
  };
}

export const isSame = (diff) => Object.values(diff).every(({ missing, extra }) => !missing.length && !extra.length);

function render(diff, version) {
  const lines = [`복원할 정책 사본: v${version}`];
  for (const [name, { missing, extra }] of Object.entries(diff)) {
    const label = name === 'routes' ? '선언 경로' : '판정 규칙';
    lines.push(`${label}: 사본에만 있음 ${missing.length}개, 현재에만 있음 ${extra.length}개`);
    for (const item of missing) lines.push(`  + 되살림 ${item}`);
    for (const item of extra) lines.push(`  - 제거 ${item}`);
  }
  return lines.join('\n');
}

async function main(args) {
  const snapshot = verifySnapshot(await readFile(SNAPSHOT, 'utf8').catch(() => { throw new Error('정책 사본이 없습니다. 복원을 중단합니다.'); }));
  const config = JSON.parse(await readFile(CONFIG, 'utf8'));
  const { RULE_IDS } = await import(pathToFileURL(resolve(root, 'src', 'decider.mjs')).href);
  const diff = diffPolicy(snapshot.policy, { allowedRoutes: config.allowedRoutes ?? [], ruleIds: [...RULE_IDS] });
  process.stdout.write(`${render(diff, snapshot.version)}\n`);
  if (!args.includes('--restore')) return;
  if (isSame(diff)) { process.stdout.write('현재 정책이 사본과 같아 바꿀 것이 없습니다.\n'); return; }
  if (!args.includes('--yes')) {
    process.stdout.write('위 변경을 확인했으면 같은 명령 끝에 --yes를 붙여 다시 실행하세요. 지금은 아무것도 바꾸지 않았습니다.\n');
    return;
  }
  config.allowedRoutes = snapshot.policy.allowedRoutes;
  await writeFile(CONFIG, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  process.stdout.write('aleph.config.json의 allowedRoutes만 사본으로 되돌렸습니다. 판정 규칙(코드)은 git으로 되돌립니다.\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => { process.stderr.write(`정책 복원 첫 오류: ${error.message}\n`); process.exitCode = 1; });
}
