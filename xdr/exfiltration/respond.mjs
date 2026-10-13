// 제작 4: 명확한 자료 반출의 목적지(dstip)만 거부 규칙으로, 알림은 xdr/alerts.log로 내보냅니다.
// 공통 처리는 xdr/apply-lib.mjs 이고 규칙이 가리키는 칸만 dstip 으로 바꿉니다. src/decider.mjs(내 ZTNA 판정기)는 고치지 않습니다.
// 정상·알림 경보에도 나온 목적지는 규칙에 넣지 않습니다. decide.mjs 는 판단 결과만 돌려줍니다.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyModule } from '../apply-lib.mjs';
import { decide } from './decide.mjs';
import { readAlerts } from './read-alerts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function respondExfiltration(root = ROOT) {
  const { alerts } = await readAlerts('exfiltration', root);
  return applyModule({ root, moduleKey: 'exfiltration', alerts, decide, field: 'dstip' });
}

const isMain = process.argv[1] && join(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { rules, appended } = await respondExfiltration();
  console.log(`거부 규칙 ${rules.length}개, 알림 ${appended}줄을 새로 적었습니다.`);
}
