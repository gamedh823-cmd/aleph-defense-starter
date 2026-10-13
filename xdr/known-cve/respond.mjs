// 제작 4: 명확한 알려진 취약점 악용 시도만 거부 규칙으로, 알림은 xdr/alerts.log로 내보냅니다.
// 공통 처리는 xdr/apply-lib.mjs 입니다. src/decider.mjs(내 ZTNA 판정기)는 고치지 않습니다.
// decide.mjs 는 판단 결과만 돌려주고, 파일 쓰기와 판정기 연결은 이 파일만 합니다.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyModule } from '../apply-lib.mjs';
import { decide } from './decide.mjs';
import { readAlerts } from './read-alerts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function respondKnownCve(root = ROOT) {
  const { alerts } = await readAlerts('known-cve', root);
  return applyModule({ root, moduleKey: 'known-cve', alerts, decide });
}

const isMain = process.argv[1] && join(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { rules, appended } = await respondKnownCve();
  console.log(`거부 규칙 ${rules.length}개, 알림 ${appended}줄을 새로 적었습니다.`);
}
