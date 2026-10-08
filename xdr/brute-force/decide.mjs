// 제작 3: decide(alert) 하나를 내보냅니다. 반환은 { action: 'block' | 'alert' | 'record', confidence, reason } 입니다.
// 확신도 0.85 이상은 block, 0.5 이상은 alert, 그 아래는 record 입니다.
// 이 파일은 다른 파일을 불러오지 않고 혼자 동작합니다. 패턴 이름은 patterns.json 과 같습니다.
// 명확한 공격은 패턴만으로 block 하고, 애매한 경보만 Jev에게 확신도를 묻습니다. Jev가 응답하지 않으면 alert 입니다.
// Jev 연결은 환경변수 JEV_API_URL(https, 선택)·JEV_API_KEY(선택)로만 합니다. 주소와 키는 코드에 적지 않습니다.

const NAME_REPEATED = '같은 주소의 로그인 실패 연속';
const NAME_SPRAY = '여러 계정에 같은 비밀번호 대입';
const NAME_WEAK = '낮은 수준의 로그인 실패 신호';
const SPRAY_WORDS = /여러 계정|서로 다른 계정|계정 이름을 바꿔|계정 \d+개|계정 여러/u;
const JEV_CAP = 0.84; // Jev는 애매한 경보를 낮출 수는 있어도 차단으로 올릴 수는 없습니다.

function facts(alert) {
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre.map(String) : [];
  const data = alert?.data ?? {};
  const accounts = typeof data.accounts === 'string' ? data.accounts.split(',').filter(Boolean).length
    : Array.isArray(data.accounts) ? data.accounts.length : 0;
  const description = String(alert?.rule?.description ?? '');
  return {
    level: Number(alert?.rule?.level ?? 0) || 0,
    count: Number(data.count ?? 0) || 0,
    accounts,
    description,
    t1110: mitre.some((id) => id === 'T1110' || id.startsWith('T1110.')),
    failureText: /로그인 실패|비밀번호/u.test(description),
  };
}

async function askJev(summary) {
  const url = process.env.JEV_API_URL;
  if (typeof url !== 'string' || !url.startsWith('https://') || typeof fetch !== 'function') return null;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(process.env.JEV_API_KEY ? { Authorization: `Bearer ${process.env.JEV_API_KEY}` } : {}) },
      body: JSON.stringify({ task: 'brute-force-confidence', alert: summary }),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const confidence = (await response.json())?.confidence;
    return typeof confidence === 'number' && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
      ? confidence : null;
  } catch {
    return null;
  }
}

const toAction = (confidence) => (confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record');

export async function decide(alert) {
  const f = facts(alert);

  // 명확한 공격: 높은 규칙 수준, 많은 실패 건수, 여러 계정 대입 중 하나라도 뚜렷하면 차단 후보입니다.
  if (f.t1110 || f.failureText) {
    const spray = f.accounts >= 5 || SPRAY_WORDS.test(f.description);
    const repeated = f.level >= 10 || f.count >= 15;
    if ((f.t1110 || f.count >= 15) && (spray || repeated)) {
      const names = [];
      if (f.count >= 15 || (f.level >= 10 && !spray)) names.push(NAME_REPEATED);
      if (spray) names.push(NAME_SPRAY);
      const confidence = Math.min(0.99, 0.9 + 0.02 * Math.min(2, Math.max(0, f.level - 10)) + (names.length > 1 ? 0.03 : 0));
      return { action: 'block', confidence: Number(confidence.toFixed(2)), reason: `패턴: ${names.join(', ')}` };
    }
  }

  // 애매한 경보: 규칙이 로그인 대입 신호로 표시했지만 수준이 낮습니다. 기본은 alert 이고 Jev가 답하면 확신도만 조정합니다.
  if (f.t1110 && f.level >= 5 && f.level <= 9) {
    const asked = await askJev({ level: f.level, count: f.count, description: f.description.slice(0, 300) });
    if (asked === null) return { action: 'alert', confidence: 0.6, reason: `패턴: ${NAME_WEAK} (Jev 응답 없음, 알림으로 처리)` };
    const confidence = Math.min(JEV_CAP, asked);
    return { action: toAction(confidence), confidence: Number(confidence.toFixed(2)), reason: `패턴: ${NAME_WEAK} (Jev 확신도 ${asked})` };
  }

  return { action: 'record', confidence: 0.05, reason: '근거 패턴 없음: 로그인 실패 공격 신호가 없는 정상 이벤트' };
}
