// 제작 4: 차단 후보만 거부 규칙으로, 알림을 xdr/alerts.log로 내보냅니다. (공통 처리는 xdr/apply-lib.mjs)
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alertLines, applyModule, buildBlockRules as build } from '../apply-lib.mjs';
import { decide } from './decide.mjs';
import { readAlerts } from './read-alerts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export { alertLines };
export const buildBlockRules = (items) => build(items, 'brute-force');

export async function applyBruteForce(root = ROOT) {
  const { alerts } = await readAlerts('brute-force', root);
  return applyModule({ root, moduleKey: 'brute-force', alerts, decide });
}

const isMain = process.argv[1] && join(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { rules, appended } = await applyBruteForce();
  console.log(`거부 규칙 ${rules.length}개, 알림 ${appended}줄을 새로 적었습니다.`);
}
