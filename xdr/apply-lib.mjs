// 보너스 공통: 차단 후보를 거부 규칙 목록으로, 알림을 xdr/alerts.log로 내보냅니다.
// src/decider.mjs(내 ZTNA 판정기)는 고치지 않습니다. block-rules.json은 판정기가 읽어 갈 수 있는 거부 규칙 목록입니다.
// decide.mjs 와는 별개 파일이고, 실행기(scripts/xdr-run.mjs)는 이 파일을 쓰지 않습니다.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const TTL_MINUTES = 60;

// 차단 후보만 규칙으로 만듭니다. 정상(record)·알림(alert) 경보에도 나온 주소는 정상 사용자일 수 있어 넣지 않습니다.
export function buildBlockRules(items, moduleKey) {
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
    ruleId: `xdr.${moduleKey}.deny.${entry.srcip}`,
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

export async function applyModule({ root, moduleKey, alerts, decide }) {
  const items = [];
  for (const alert of alerts) items.push({ alert, decision: await decide(alert) });

  const rules = buildBlockRules(items, moduleKey);
  const dir = join(root, 'xdr', moduleKey);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'block-rules.json'), `${JSON.stringify({
    schema: 'aleph.xdr.block-rules.v1', moduleKey, ttlMinutes: TTL_MINUTES, rules,
  }, null, 2)}\n`, 'utf8');

  // 알림은 한 줄씩 쌓고, 같은 경보·같은 행동은 두 번 적지 않습니다.
  const logPath = join(root, 'xdr', 'alerts.log');
  let existing = '';
  try { existing = await readFile(logPath, 'utf8'); } catch { /* 처음 만드는 파일입니다. */ }
  const keyOf = (line) => line.split('\t').slice(1, 3).join('\t');
  const known = new Set(existing.split(/\r?\n/u).filter(Boolean).map(keyOf));
  const fresh = alertLines(items).filter((line) => !known.has(keyOf(line)));
  if (fresh.length) await writeFile(logPath, `${existing}${fresh.join('\n')}\n`, 'utf8');
  return { rules, appended: fresh.length, items };
}
