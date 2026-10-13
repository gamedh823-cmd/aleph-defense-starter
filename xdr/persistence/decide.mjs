// 제작 3: decide(alert) 하나를 내보냅니다. 반환은 { action: 'block' | 'alert' | 'record', confidence, reason } 입니다.
// 확신도 0.85 이상은 block, 0.5 이상은 alert, 그 아래는 record 입니다.
// 이 파일은 다른 파일을 불러오지 않고, 파일을 읽거나 쓰지 않고, 바깥에 묻지 않고 혼자 계산합니다.
// 패턴 이름은 xdr/persistence/patterns.json 과 같습니다.

const NAME_SERVICE = '서명 없는 새 서비스 등록';
const NAME_TASK = '낯선 예약 작업';
const NAME_STARTUP = '시작 폴더 변경';
const NAME_REPEATED = '반복되는 서비스·작업 등록';
const NAME_WEAK = '낮은 수준의 지속성 신호';

const BLOCK_LEVEL = 10;
const WEAK_LEVEL = 5;

// 평소 목록에 없거나 서명이 없다는 뜻의 표현입니다.
const UNKNOWN_OR_UNSIGNED = /서명 없|서명이 없|서명 없는|평소 목록에 없|처음 보는|임의 문자열|다시 켜도 남도록|실행 파일이 바뀌/u;
// 정상으로 보이는 표현입니다. 이 표현이 있으면 차단하지 않습니다.
const BENIGN_WORDS = /서명된|평소 시각|평소 저장소|기존 .*(?:마쳤|실행 중)|읽기만|그대로입니다|설명만/u;
const TEMP_PATH = /\\(?:Temp|Startup)\\|\/tmp\//iu;
const SERVICE_WORDS = /서비스/u;
const TASK_WORDS = /예약 작업/u;
const STARTUP_WORDS = /시작 폴더|시작 프로그램|시작 항목/u;

function facts(alert) {
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre.map(String) : [];
  const description = String(alert?.rule?.description ?? '');
  const path = String(alert?.data?.path ?? '');
  const has = (id) => mitre.some((m) => m === id || m.startsWith(`${id}.`));
  return {
    level: Number(alert?.rule?.level ?? 0) || 0,
    count: Number(alert?.data?.count ?? 0) || 0,
    description,
    t1543: has('T1543'),
    t1053: has('T1053'),
    unknown: UNKNOWN_OR_UNSIGNED.test(description),
    benign: BENIGN_WORDS.test(description),
    temp: TEMP_PATH.test(path) || /임시 폴더/u.test(description),
  };
}

export function decide(alert) {
  const f = facts(alert);
  const persistence = f.t1543 || f.t1053;
  if (!persistence) {
    return { action: 'record', confidence: 0.05, reason: '근거 패턴 없음: 지속성 표시가 없는 정상 이벤트' };
  }

  // 신호 수: 평소 목록에 없음·서명 없음, 임시 폴더 경로, 반복, 두 기법 동시 표시.
  const repeated = f.count >= 3;
  const both = f.t1543 && f.t1053;
  const signals = [f.unknown, f.temp, repeated, both].filter(Boolean).length;

  // 명확한 공격: 수준이 높거나(10 이상) 수준이 8 이상이면서 신호가 둘 이상일 때, 정상 표현이 없을 때만 차단 후보입니다.
  const clear = !f.benign && (f.level >= BLOCK_LEVEL || (f.level >= 8 && signals >= 2));
  if (clear) {
    const names = [];
    if (f.t1543 && (SERVICE_WORDS.test(f.description) || !STARTUP_WORDS.test(f.description))) names.push(NAME_SERVICE);
    if (f.t1053 && (TASK_WORDS.test(f.description) || names.length === 0)) names.push(NAME_TASK);
    if (STARTUP_WORDS.test(f.description)) names.push(NAME_STARTUP);
    if (repeated) names.push(NAME_REPEATED);
    const unique = [...new Set(names)];
    let confidence = 0.88 + 0.02 * Math.min(2, Math.max(0, f.level - 10)) + 0.02 * Math.min(2, signals);
    if (f.level < BLOCK_LEVEL) confidence = 0.86;
    confidence = Math.min(0.99, confidence);
    return { action: 'block', confidence: Number(confidence.toFixed(2)), reason: `패턴: ${unique.join(', ')}` };
  }

  // 애매한 시도: 지속성 표시는 있으나 수준이 낮거나 서명을 아직 모릅니다. 막지 않고 알립니다.
  if (f.level >= WEAK_LEVEL) {
    const confidence = f.temp || f.unknown ? 0.6 : 0.55;
    return { action: 'alert', confidence, reason: `패턴: ${NAME_WEAK}` };
  }

  return { action: 'record', confidence: 0.05, reason: '근거 패턴 없음: 평소 목록과 같은 정상 이벤트' };
}
