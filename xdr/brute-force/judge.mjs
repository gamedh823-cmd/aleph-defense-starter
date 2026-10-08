// 판단 로직: 경보를 패턴과 맞춰 보고 block·alert·record 중 하나를 고릅니다.
// 기본 판단은 규칙만으로 정해지고(격리된 환경에서도 같은 결과), Jev는 애매한 경보에만 묻습니다.
import { readFileSync } from 'node:fs';
import { redact } from './read-alerts.mjs';

const PATTERNS = JSON.parse(readFileSync(new URL('./patterns.json', import.meta.url), 'utf8')).patterns;
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;
const JEV_CAP = 0.84; // Jev는 애매한 경보를 낮출 수는 있어도 차단으로 올릴 수는 없습니다.

function facts(alert) {
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
  const accounts = typeof alert?.data?.accounts === 'string'
    ? alert.data.accounts.split(',').filter(Boolean).length : 0;
  return {
    level: Number(alert?.rule?.level ?? 0),
    count: Number(alert?.data?.count ?? 0) || 0,
    accounts,
    mitre,
    description: String(alert?.rule?.description ?? ''),
  };
}

function matches(pattern, f) {
  const m = pattern.match;
  if (m.mitre && !f.mitre.some((id) => id === m.mitre || id.startsWith(`${m.mitre}.`))) return false;
  if (m.minLevel !== undefined && f.level < m.minLevel) return false;
  if (m.maxLevel !== undefined && f.level > m.maxLevel) return false;
  const signals = [];
  if (m.minCount !== undefined) signals.push(f.count >= m.minCount);
  if (m.minAccounts !== undefined || m.descriptionPatterns) {
    signals.push((m.minAccounts !== undefined && f.accounts >= m.minAccounts)
      || (m.descriptionPatterns ?? []).some((source) => new RegExp(source, 'u').test(f.description)));
  }
  return signals.length === 0 || signals.every(Boolean);
}

const toAction = (confidence) => (confidence >= BLOCK_AT ? 'block' : confidence >= ALERT_AT ? 'alert' : 'record');

export async function decideWith(alert, ask) {
  const f = facts(alert);
  const hits = PATTERNS.filter((pattern) => matches(pattern, f));
  const clear = hits.filter((pattern) => pattern.verdict === 'block');

  if (clear.length) {
    // 명확한 공격: 규칙 수준이 높고 패턴이 겹칠수록 확신도가 올라갑니다. Jev를 기다리지 않습니다.
    const confidence = Math.min(0.99, 0.9 + 0.02 * Math.min(2, Math.max(0, f.level - 10)) + (clear.length > 1 ? 0.03 : 0));
    return { action: 'block', confidence: Number(confidence.toFixed(2)), reason: `패턴: ${clear.map((p) => p.name).join(', ')}` };
  }

  if (hits.length) {
    // 애매한 경보: 기본은 alert이고, Jev가 답하면 확신도만 조정합니다.
    const name = hits[0].name;
    const summary = { level: f.level, count: f.count, description: redact(f.description) };
    const asked = await ask(summary);
    if (asked === null) return { action: 'alert', confidence: 0.6, reason: `패턴: ${name} (Jev 응답 없음, 알림으로 처리)` };
    const confidence = Math.min(JEV_CAP, asked);
    return { action: toAction(confidence), confidence: Number(confidence.toFixed(2)), reason: `패턴: ${name} (Jev 확신도 ${asked})` };
  }

  return { action: 'record', confidence: 0.05, reason: '근거 패턴 없음: 로그인 실패 공격 신호가 없는 정상 이벤트' };
}
