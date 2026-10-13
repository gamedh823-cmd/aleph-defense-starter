// 제작 3: decide(alert) 하나를 내보냅니다. 반환은 { action: 'block' | 'alert' | 'record', confidence, reason } 입니다.
// 확신도 0.85 이상은 block, 0.5 이상은 alert, 그 아래는 record 입니다.
// 이 파일은 다른 파일을 불러오지 않고, 파일을 읽거나 쓰지 않고, 바깥에 묻지 않고 혼자 계산합니다.
// 패턴 이름은 xdr/privilege/patterns.json 과 같습니다.

const NAME_ADMIN_GROUP = '관리자 그룹 추가';
const NAME_ADMIN_COMMAND = '처음 보는 관리자 명령';
const NAME_OFF_HOURS = '업무 시간 밖 권한 사용';
const NAME_REPEATED = '짧은 시간의 반복 권한 변경';
const NAME_WEAK = '낮은 수준의 권한 변경 신호';

const BLOCK_LEVEL = 10;
const WEAK_LEVEL = 5;

const ADMIN_GROUP = /관리자 그룹(?!은 아닙니다)|다시 관리자로|관리자로 들어/u;
const ADMIN_COMMAND = /관리자 명령|권한 명령|관리자 권한으로 바뀌|다른 계정의 권한|방금 관리자가 된/u;
const OFF_HOURS = /수업 시간 밖|업무 시간 밖|업무처럼 보이지 않는 시각/u;
const NEW_ADDRESS = /처음 보는 주소|요청 주소는 처음|원격 주소/u;
const REPEATED_WORDS = /계정 \d+개|다시 관리자로|연속/u;
// 결과가 이어지지 않았거나 평소와 같다는 뜻의 표현입니다. 이 표현이 있으면 차단하지 않습니다.
const SOFTENERS = /취소됐|실패|명령은 없습니다|변경은 없습니다|관리자 그룹은 아닙니다|설명만|읽기만|조회|한 번 실행됐|평소 주소/u;

function facts(alert) {
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre.map(String) : [];
  const description = String(alert?.rule?.description ?? '');
  const has = (id) => mitre.some((m) => m === id || m.startsWith(`${id}.`));
  const count = Number(alert?.data?.count ?? 0) || 0;
  return {
    level: Number(alert?.rule?.level ?? 0) || 0,
    count,
    t1068: has('T1068'),
    t1078: has('T1078'),
    adminGroup: ADMIN_GROUP.test(description),
    adminCommand: ADMIN_COMMAND.test(description),
    offHours: OFF_HOURS.test(description),
    newAddress: NEW_ADDRESS.test(description),
    repeated: count >= 2 || REPEATED_WORDS.test(description),
    soft: SOFTENERS.test(description),
  };
}

export function decide(alert) {
  const f = facts(alert);
  const marked = f.t1068 || f.t1078;
  if (!marked) {
    return { action: 'record', confidence: 0.05, reason: '근거 패턴 없음: 권한 상승 표시가 없는 정상 이벤트' };
  }

  // 신호 수: 관리자 그룹 추가, 관리자 명령, 낯선 주소, 업무 시간 밖, 반복.
  const signals = [f.adminGroup, f.adminCommand, f.newAddress, f.offHours, f.repeated].filter(Boolean).length;

  // 명확한 공격: 수준이 10 이상이거나, 수준 8 이상이면서 신호가 둘 이상이고, 약화 표현이 없을 때입니다.
  const clear = !f.soft && (f.level >= BLOCK_LEVEL || (f.level >= 8 && signals >= 2));
  if (clear) {
    const names = [];
    if (f.adminGroup) names.push(NAME_ADMIN_GROUP);
    if (f.adminCommand) names.push(NAME_ADMIN_COMMAND);
    if (f.offHours) names.push(NAME_OFF_HOURS);
    if (f.repeated) names.push(NAME_REPEATED);
    if (names.length === 0) names.push(f.t1068 ? NAME_ADMIN_COMMAND : NAME_ADMIN_GROUP);
    let confidence = 0.88 + 0.02 * Math.min(2, Math.max(0, f.level - BLOCK_LEVEL)) + 0.02 * Math.min(3, Math.max(0, signals - 1));
    if (f.level < BLOCK_LEVEL) confidence = 0.86;
    confidence = Math.min(0.99, confidence);
    return { action: 'block', confidence: Number(confidence.toFixed(2)), reason: `패턴: ${names.join(', ')}` };
  }

  // 애매한 시도: 표시는 있으나 수준이 낮거나 결과가 이어지지 않았습니다. 막지 않고 알립니다.
  if (f.level >= WEAK_LEVEL) {
    return { action: 'alert', confidence: signals > 0 ? 0.6 : 0.55, reason: `패턴: ${NAME_WEAK}` };
  }

  return { action: 'record', confidence: 0.05, reason: '근거 패턴 없음: 평소와 같은 정상 이벤트' };
}
