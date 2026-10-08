// 제작 4: 차단 후보를 거부 규칙 목록으로, 알림을 xdr/alerts.log로 내보냅니다.
// src/decider.mjs(내 ZTNA 판정기)는 고치지 않습니다. block-rules.json은 판정기가 읽어 갈 수 있는 거부 규칙 목록입니다.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from './decide.mjs';
import { readAlerts } from './read-alerts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TTL_MINUTES = 60;

// 차단 후보만 규칙으로 만듭니다. 정상(record)·알림(alert) 경보에도 나온 주소는 정상 사용자일 수 있어 넣지 않습니다.
export function buildBlockRules(items) {
  const safeIps = new Set(items.filter((item) => item.decision.action !== 'block').map((item) => item.alert.data?.srcip));
  const bySource = new Map();
  for (const { alert, decision } of items) {
    const ip = alert.data?.srcip;
    if (decision.action !== 'block' || !ip || safeIps.has(ip)) continue;
    const entry = bySource.get(ip) ?? { srcip: ip, evidenceAlertIds: [], last: 0, reason: decision.reason };
    entry.evidenceAlertIds.push(alert.id);
    entry.last = Math.max(entry.last, Date.parse(alert.timestamp) || 0);
    bySource.set(ip, entry);
  }
  return [...bySource.values()].map((entry) => ({
    ruleId: `xdr.brute-force.deny.${entry.srcip}`,
    action: 'deny',
    srcip: entry.srcip,
    evidenceAlertIds: entry.evidenceAlertIds,
    expiresAt: new Date(entry.last + TTL_MINUTES * 60 * 1000).toISOString(),
    reason: entry.reason,
  }));
}

export function alertLines(items) {
  return items
    .filter((item) => item.decision.action !== 'record')
    .map(({ alert, decision }) => [alert.timestamp, decision.action, alert.id, alert.data?.srcip ?? '-', decision.reason].join('\t'));
}

export async function applyBruteForce(root = ROOT) {
  const { alerts } = await readAlerts('brute-force', root);
  const items = [];
  for (const alert of alerts) items.push({ alert, decision: await decide(alert) });

  const rules = buildBlockRules(items);
  const dir = join(root, 'xdr', 'brute-force');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'block-rules.json'), `${JSON.stringify({
    schema: 'aleph.xdr.block-rules.v1', moduleKey: 'brute-force', ttlMinutes: TTL_MINUTES, rules,
  }, null, 2)}\n`, 'utf8');

  // 알림은 한 줄씩 쌓고, 같은 경보·같은 행동은 두 번 적지 않습니다.
  const logPath = join(root, 'xdr', 'alerts.log');
  let existing = '';
  try { existing = await readFile(logPath, 'utf8'); } catch { /* 처음 만드는 파일입니다. */ }
  const known = new Set(existing.split(/\r?\n/u).filter(Boolean).map((line) => line.split('\t').slice(1, 3).join('\t')));
  const fresh = alertLines(items).filter((line) => !known.has(line.split('\t').slice(1, 3).join('\t')));
  if (fresh.length) await writeFile(logPath, `${existing}${fresh.join('\n')}\n`, 'utf8');
  return { rules, appended: fresh.length };
}

const isMain = process.argv[1] && join(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { rules, appended } = await applyBruteForce();
  console.log(`거부 규칙 ${rules.length}개, 알림 ${appended}줄을 새로 적었습니다.`);
}
