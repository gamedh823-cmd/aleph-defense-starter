// 1~12단계 자기 점검(운영 측 12단계 규칙). 이 파일은 아무것도 불러오지 않고 전역 fetch·crypto만 씁니다.
// - runAttackChecks(배포 주소 또는 설정)이 배포에 실제 GET 요청을 보내고, 응답 상태로 observed와 result를 정합니다.
//   결과는 { attackId, stage, expected, observed, result } 다섯 값뿐입니다(result: blocked·breached·not_run).
// - observed에는 심판이 요청 기록과 대조할 수 있는 사실만 적습니다: HTTP 상태, 요청을 못 보냈으면 network_error, 보내지 않았으면 not_run.
// - 점검 하나(attackId)에는 요청 하나만 보내고, 요청마다 fetch 옵션 alephEvidence에 사례(caseId)와 요청 이름(requestKey)을 연결합니다.
//   요청 헤더·주소에는 넣지 않습니다. 제출 묶음은 읽기(GET·HEAD) 요청만 보낼 수 있고 요청은 24건 이하입니다.
// - 로그인 토큰이 필요하거나 쓰기 요청이 필요한 점검은 보내지 않고 observed·result를 not_run으로 둡니다.
// Never return tokens, private keys, real names, or note bodies. 이 결과는 학생의 자기 점검이며 심판 판정이 아닙니다.

const TEST_UUID = '00000000-0000-4000-8000-000000000001';
// 서명 자리가 엉터리인 가짜 토큰입니다. 실제 토큰이 아닙니다.
const FAKE_TOKEN = 'Bearer aaaa.bbbb.cccc';
const TIMEOUT_MS = 5000;
const READ_ONLY_METHODS = new Set(['GET', 'HEAD']);
const MAX_REQUESTS = 24;
const DENIED_STATUS = new Set([401, 403, 404, 405]);
const NOTE_FIELDS = /"(?:title|body|content)"\s*:/u;
const KEY_PATTERN = /sb_(?:publishable|secret)_|eyJ[A-Za-z0-9_-]{12,}\.eyJ/u;

// 요청마다 새로 만드는 고유한 이름. 심판이 같은 요청을 사례와 이어서 관측할 때 요청끼리 겹치지 않게 합니다.
function newRequestKey() {
  const id = globalThis.crypto?.randomUUID?.();
  if (id) return id;
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function appBase(input) {
  const target = typeof input === 'string' ? input : input?.publicAppUrl;
  let app;
  try {
    app = new URL(target);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  return app;
}

// 요청 한 건. 응답 본문은 메모 필드·키 문자열이 있는지만 보고 결과에 싣지 않습니다.
async function probe(ctx, caseId, path, { method = 'GET', headers = {} } = {}) {
  if (!READ_ONLY_METHODS.has(method)) return { ran: false, error: '읽기 요청만 보낼 수 있음' };
  ctx.sent += 1;
  if (ctx.sent > MAX_REQUESTS) return { ran: false, error: '요청 수 한도(24건) 초과' };
  try {
    const response = await fetch(new URL(path, ctx.base), {
      method, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json', ...headers },
      alephEvidence: { caseId, requestKey: newRequestKey() },
    });
    const text = (await response.text()).slice(0, 60000);
    let json = null;
    try { json = JSON.parse(text); } catch { /* 화면(HTML)이나 비정상 응답 */ }
    return { ran: true, status: response.status, text, json, hasNotes: NOTE_FIELDS.test(text) };
  } catch (error) {
    return { ran: false, error: String(error?.message ?? error).slice(0, 60) };
  }
}

// 거부 규칙: 이 배포에 실제로 보낸 요청이 거부 응답을 받고 메모 필드가 없을 때만 blocked입니다. 서버 오류(5xx)는 응답을 얻지 못한 것이라 not_run입니다.
const denied = (r) => DENIED_STATUS.has(r.status) && !r.hasNotes;
const refusedJson = (r) => [401, 403].includes(r.status) && typeof r.json?.error === 'string' && !r.hasNotes;
const refusedWrongMethod = (r) => r.status === 405 && typeof r.json?.error === 'string' && !r.hasNotes;
const publicFileEmpty = (r) => (r.status === 404 || (r.status === 200 && Array.isArray(r.json?.notes) && r.json.notes.length === 0)) && !r.hasNotes;
const firstPageHasNoKeys = (r) => r.status === 200 && !KEY_PATTERN.test(r.text);

function outcome(r, rule) {
  if (!r.ran) return { observed: 'network_error', result: 'not_run' };
  if (r.status >= 500) return { observed: `HTTP ${r.status}`, result: 'not_run' };
  return { observed: `HTTP ${r.status}`, result: rule(r) ? 'blocked' : 'breached' };
}

// 배포에 실제로 보내는 점검(모두 GET, 점검 하나에 요청 하나).
const SENT = [
  ['s01_static_notes', 1, '공개 파일(/data.json)에 메모가 없음', '/data.json', {}, publicFileEmpty],
  ['s03_no_token_list', 3, '로그인 없이 메모 목록을 요청하면 401·403과 JSON 오류', '/api/notes', {}, refusedJson],
  ['s03_forged_token', 3, '서명이 맞지 않는 가짜 토큰으로 요청하면 401·403과 JSON 오류', '/api/notes', { headers: { authorization: FAKE_TOKEN } }, refusedJson],
  ['s04_no_token_item', 4, '로그인 없이 메모 한 건을 조회하면 401·403과 JSON 오류', `/api/notes/${TEST_UUID}`, {}, refusedJson],
  ['s04_identity_query', 4, '쿼리로 넣은 사용자·역할 값은 무시하고 로그인 없이는 401·403', `/api/my/notes?userId=${TEST_UUID}&role=instructor`, {}, refusedJson],
  ['s04_identity_header', 4, '헤더로 넣은 사용자·역할 값은 무시하고 로그인 없이는 401·403', '/api/my/notes', { headers: { 'x-user-id': TEST_UUID, 'x-role': 'instructor' } }, refusedJson],
  ['s05_first_page_keys', 5, '첫 화면 파일에 Supabase 키 문자열이 없음', '/', {}, firstPageHasNoKeys],
  ['s05_direct_table', 5, '배포 주소로 원본 표(/rest/v1/defense_memos)를 직접 읽을 수 없음', '/rest/v1/defense_memos', {}, denied],
  ['s08_notices_no_token', 8, '로그인 없이 반 공지 목록을 요청하면 401·403과 JSON 오류', '/api/notices', {}, refusedJson],
  ['s08_my_notes_no_token', 8, '로그인 없이 내 메모 목록을 요청하면 401·403과 JSON 오류', '/api/my/notes', {}, refusedJson],
  ['s10_restore_get', 10, '복구 경로를 읽기(GET)로 부르면 405와 JSON 오류(복구는 POST와 로그인만 받음)', `/api/restore/${TEST_UUID}`, {}, refusedWrongMethod],
  ['s11_device_no_token', 11, '로그인 없이 기기 승인 상태를 요청하면 401·403과 JSON 오류', '/api/device/status', {}, refusedJson],
  ['s12_warroom_no_token', 12, '로그인 없이 작전실 요약을 요청하면 401·403과 JSON 오류', '/api/warroom/summary', {}, refusedJson],
];

// 요청을 보내지 않는 점검: 쓰기 요청, 시험 계정 토큰, 서명 키, 심판·운영 엔진이 필요합니다. observed와 result는 not_run입니다.
const NOT_RUN = [
  ['s06_unregistered', 6, '미등록 기기의 요청은 판정기가 device_not_registered로 거부(요청을 보내지 않음: 판정기 연습은 npm run decider:test)'],
  ['s07_compound', 7, '낯선 시각·네트워크·대량 행동이 겹친 접속은 추가 확인 요구(요청을 보내지 않음: 판정기 연습은 npm run decider:test)'],
  ['s08_cross_zone_memo', 8, '다른 사용자의 메모를 조회·수정하면 404(요청을 보내지 않음: 시험 계정 토큰 필요)'],
  ['s08_student_notice_edit', 8, '일반 학생 계정이 강사 공지를 수정하면 403(요청을 보내지 않음: 쓰기 요청과 시험 계정 토큰 필요)'],
  ['s09_burst_read', 9, '같은 사용자의 GET이 10분 안에 120건을 넘으면 회수 제안(요청을 보내지 않음: 탐지 연습은 npm run detect:test)'],
  ['s10_restore_unauth', 10, '로그인 없는 복구 요청은 401(요청을 보내지 않음: POST 쓰기 요청이라 npm run matrix에서 확인)'],
  ['s11_unsigned_write', 11, '서명 없는 수정 요청은 거부(요청을 보내지 않음: 쓰기 요청과 서명 키 필요, 서명 검증은 운영 엔진이 확인)'],
];

export async function runAttackChecks(input) {
  const ctx = { base: appBase(input), sent: 0 };
  const out = [];
  for (const [attackId, stage, expected, path, options, rule] of SENT) {
    const { observed, result } = outcome(await probe(ctx, attackId, path, options), rule);
    out.push({ attackId, stage, expected, observed, result });
  }
  for (const [attackId, stage, expected] of NOT_RUN) {
    out.push({ attackId, stage, expected, observed: 'not_run', result: 'not_run' });
  }
  return out.sort((a, b) => a.stage - b.stage);
}
