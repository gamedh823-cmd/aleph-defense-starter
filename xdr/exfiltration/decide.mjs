// 제작 3: decide(alert) 하나를 내보냅니다. 반환은 { action: 'block' | 'alert' | 'record', confidence, reason } 입니다.
// 확신도 0.85 이상은 block, 0.5 이상은 alert, 그 아래는 record 입니다.
// 이 파일은 다른 파일을 불러오지 않고, 파일을 읽거나 쓰지 않고, 바깥에 묻지 않고 혼자 계산합니다.
// 패턴 이름은 xdr/exfiltration/patterns.json 과 같습니다.

const NAME_NEW_DEST = '처음 보는 목적지로 대용량 전송';
const NAME_ARCHIVE = '업무 시간 밖 압축 파일 반출';
const NAME_REPEATED = '같은 목적지로 반복 대용량 전송';
const NAME_C2 = '명령 통로를 통한 자료 일괄 전송';
const NAME_WEAK = '낮은 수준의 외부 전송 신호';

const BLOCK_LEVEL = 10;
const WEAK_LEVEL = 5;
const LARGE_BYTES = 50_000_000; // 5천만 바이트 이상은 대용량으로 봅니다.
const SMALL_BYTES = 1_000_000; // 1메가바이트 미만은 차단하지 않습니다.
const MANY_FILES = 50;
const REPEAT_COUNT = 5;

const NEW_DEST = /처음 보는 (?:목적지|주소)|쓰지 않던 포트/u;
const OFF_HOURS = /수업 시간 밖|업무 시간 밖|업무처럼 보이지 않는 시각/u;
const ARCHIVE = /압축 파일/u;
const C2 = /명령 통로|자료실 전체|복사됐/u;
const REPEAT_WORDS = /반복/u;
// 작거나 실패했거나 평소와 같다는 뜻의 표현입니다. 이 표현이 있으면 차단하지 않습니다.
const SOFTENERS = /실패|아직 없습니다|작은 |한 번 높|한 번 늘|일부만|백업처럼|수업 자료 주소|평소 목적지|큰 파일은 아닙니다|전송은 1건|동기화|읽었습니다/u;

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

function facts(alert) {
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre.map(String) : [];
  const description = String(alert?.rule?.description ?? '');
  const data = alert?.data && typeof alert.data === 'object' ? alert.data : {};
  const has = (id) => mitre.some((m) => m === id || m.startsWith(`${id}.`));
  const bytes = toNumber(data.bytes);
  const files = toNumber(data.files);
  const count = toNumber(data.count);
  return {
    level: Number(alert?.rule?.level ?? 0) || 0,
    t1041: has('T1041'),
    t1048: has('T1048'),
    bytes,
    bytesKnown: data.bytes !== undefined,
    newDest: NEW_DEST.test(description),
    offHours: OFF_HOURS.test(description),
    archive: ARCHIVE.test(description),
    c2: C2.test(description),
    large: bytes >= LARGE_BYTES,
    bulk: files >= MANY_FILES,
    repeated: count >= REPEAT_COUNT || (REPEAT_WORDS.test(description) && count >= 3),
    soft: SOFTENERS.test(description),
  };
}

export function decide(alert) {
  const f = facts(alert);
  if (!f.t1041 && !f.t1048) {
    return { action: 'record', confidence: 0.05, reason: '근거 패턴 없음: 외부 전송 표시가 없는 정상 이벤트' };
  }

  const signals = [f.newDest, f.offHours, f.large, f.bulk, f.repeated, f.archive, f.c2].filter(Boolean).length;
  const small = f.bytesKnown && f.bytes < SMALL_BYTES;

  // 명확한 공격: 수준이 10 이상이거나(수준 8 이상이면서 신호가 둘 이상), 작은 전송·약화 표현이 아닐 때만 차단 후보입니다.
  const clear = !f.soft && !small && (f.level >= BLOCK_LEVEL || (f.level >= 8 && signals >= 2));
  if (clear) {
    const names = [];
    if (f.newDest || (f.large && !f.c2)) names.push(NAME_NEW_DEST);
    if (f.archive && (f.offHours || f.newDest || f.level >= BLOCK_LEVEL)) names.push(NAME_ARCHIVE);
    if (f.repeated) names.push(NAME_REPEATED);
    if (f.c2) names.push(NAME_C2);
    if (names.length === 0) names.push(f.t1041 ? NAME_C2 : NAME_NEW_DEST);
    const unique = [...new Set(names)];
    let confidence = 0.88 + 0.02 * Math.min(2, Math.max(0, f.level - BLOCK_LEVEL)) + 0.02 * Math.min(3, Math.max(0, signals - 1));
    if (f.level < BLOCK_LEVEL) confidence = 0.86;
    confidence = Math.min(0.99, confidence);
    return { action: 'block', confidence: Number(confidence.toFixed(2)), reason: `패턴: ${unique.join(', ')}` };
  }

  // 애매한 시도: 표시는 있으나 수준이 낮거나 전송이 작거나 실패했습니다. 막지 않고 알립니다.
  if (f.level >= WEAK_LEVEL) {
    return { action: 'alert', confidence: signals > 0 ? 0.6 : 0.55, reason: `패턴: ${NAME_WEAK}` };
  }

  return { action: 'record', confidence: 0.05, reason: '근거 패턴 없음: 평소와 같은 정상 이벤트' };
}
