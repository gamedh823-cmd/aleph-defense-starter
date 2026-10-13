// 9단계 탐지 함수입니다. 반 엔진이 검증한 가상 사건만 전달해야 하며, 브라우저가 보낸 사용자 번호는 받지 않습니다.
// 사건에서는 시각(at)·요청 종류(method)·가명 사용자(identity.sub)만 읽고, 메모 내용·토큰·실명은 읽지도 저장하지도 않습니다.
// 규칙 burst_read: 같은 sub의 GET이 어느 10분 구간에서든 120건을 넘을 때만 그 sub의 회수를 제안합니다.
// 제안만 돌려줍니다. 실제 회수와 경과 시간은 심판·운영 엔진이 확인하며, 이 함수는 기기 권한을 바꾸지 않습니다.
const WINDOW_MS = 10 * 60 * 1000;
const BURST_LIMIT = 120;
const SUBJECT = /^[A-Za-z0-9_.:-]{1,128}$/u;

// 모양이 맞는 GET 사건만 {at(ms), sub}로 줄입니다. 나머지는 근거로 쓰지 않습니다.
function readEvent(event) {
  if (!event || typeof event !== 'object' || event.method !== 'GET') return null;
  const sub = event.identity?.sub;
  const at = typeof event.at === 'string' ? Date.parse(event.at) : Number.NaN;
  if (typeof sub !== 'string' || !SUBJECT.test(sub) || !Number.isFinite(at)) return null;
  return { at, sub };
}

// sub별 시각 목록에서 10분 구간의 건수가 한도를 처음 넘는 시각을 돌려줍니다. 없으면 null입니다.
function firstBurstAt(times) {
  const sorted = [...times].sort((a, b) => a - b);
  let start = 0;
  for (let end = 0; end < sorted.length; end += 1) {
    while (sorted[end] - sorted[start] > WINDOW_MS) start += 1;
    if (end - start + 1 > BURST_LIMIT) return sorted[end];
  }
  return null;
}

export function detect(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  const bySubject = new Map();
  for (const event of events) {
    const read = readEvent(event);
    if (!read) continue;
    if (!bySubject.has(read.sub)) bySubject.set(read.sub, []);
    bySubject.get(read.sub).push(read.at);
  }
  // 폭주한 사용자가 여럿이면 먼저 한도를 넘은 한 명만 제안합니다(같으면 이름순).
  let found = null;
  for (const [sub, times] of bySubject) {
    const at = firstBurstAt(times);
    if (at !== null && (!found || at < found.at || (at === found.at && sub < found.sub))) found = { sub, at };
  }
  return found
    ? { action: 'propose_revocation', reasonCode: 'burst_read', subject: found.sub }
    : { action: 'observe' };
}
