// 제작 3: decide(alert) 하나를 내보냅니다. 반환은 { action: 'block' | 'alert' | 'record', confidence, reason } 입니다.
// 확신도 0.85 이상은 block, 0.5 이상은 alert, 그 아래는 record 입니다.
// 이 파일은 다른 파일을 불러오지 않고 혼자 동작합니다. 패턴 이름은 patterns.json 과 같습니다.
// 명확한 공격은 패턴만으로 block 하고, 애매한 경보만 Jev에게 확신도를 묻습니다. Jev가 응답하지 않으면 alert 입니다.
// Jev 연결은 환경변수 JEV_API_URL(https, 선택)·JEV_API_KEY(선택)로만 합니다. 주소와 키는 코드에 적지 않습니다.

const NAME_SQL = '요청 인자 안의 SQL 구문';
const NAME_SCRIPT = '스크립트 삽입 표기';
const NAME_PATH = '경로 거슬러 올라가기 반복';
const NAME_COMMAND = '명령 구분자 삽입';
const NAME_REPEATED = '반복되는 주입 형태 요청';
const NAME_WEAK = '낮은 수준의 주입 형태 신호';
const JEV_CAP = 0.84; // Jev는 애매한 경보를 낮출 수는 있어도 차단으로 올릴 수는 없습니다.

const SHAPES = [
  [NAME_SQL, /SQL|데이터베이스 조회/iu],
  [NAME_SCRIPT, /스크립트 (?:삽입|표식|표기)|삽입 표기/u],
  [NAME_PATH, /거슬러|경로 이탈/u],
  [NAME_COMMAND, /명령 구분자/u],
];

function facts(alert) {
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre.map(String) : [];
  const description = String(alert?.rule?.description ?? '');
  return {
    level: Number(alert?.rule?.level ?? 0) || 0,
    count: Number(alert?.data?.count ?? 0) || 0,
    description,
    t1190: mitre.some((id) => id === 'T1190' || id.startsWith('T1190.')),
    shapes: SHAPES.filter(([, pattern]) => pattern.test(description)).map(([name]) => name),
  };
}

async function askJev(summary) {
  const url = process.env.JEV_API_URL;
  if (typeof url !== 'string' || !url.startsWith('https://') || typeof fetch !== 'function') return null;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(process.env.JEV_API_KEY ? { Authorization: `Bearer ${process.env.JEV_API_KEY}` } : {}) },
      body: JSON.stringify({ task: 'web-injection-confidence', alert: summary }),
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

  // 명확한 공격: T1190 경보 중 규칙 수준이 높거나 같은 형태가 여러 번 반복되면 차단 후보입니다.
  // 주입 형태 표기가 설명에 있으면 반복 기준을 낮춰 3번부터 봅니다.
  const repeated = f.level >= 10 || f.count >= 5 || (f.shapes.length > 0 && f.count >= 3);
  if (f.t1190 && repeated) {
    const names = f.shapes.length ? [...f.shapes] : [NAME_REPEATED];
    const confidence = Math.min(0.99, 0.9 + 0.02 * Math.min(2, Math.max(0, f.level - 10)) + (names.length > 1 ? 0.03 : 0));
    return { action: 'block', confidence: Number(confidence.toFixed(2)), reason: `패턴: ${names.join(', ')}` };
  }

  // 애매한 경보: 주입 형태로 표시됐지만 수준이 낮거나 반복이 없습니다. 기본은 alert 이고 Jev가 답하면 확신도만 조정합니다.
  if (f.t1190 && f.level >= 5) {
    const asked = await askJev({ level: f.level, count: f.count, description: f.description.slice(0, 300) });
    if (asked === null) return { action: 'alert', confidence: 0.6, reason: `패턴: ${NAME_WEAK} (Jev 응답 없음, 알림으로 처리)` };
    const confidence = Math.min(JEV_CAP, asked);
    return { action: toAction(confidence), confidence: Number(confidence.toFixed(2)), reason: `패턴: ${NAME_WEAK} (Jev 확신도 ${asked})` };
  }

  return { action: 'record', confidence: 0.05, reason: '근거 패턴 없음: 주입 형태 신호가 없는 정상 요청' };
}
