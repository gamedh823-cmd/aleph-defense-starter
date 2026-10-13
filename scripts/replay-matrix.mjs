// 12단계: 1~11단계의 정상·금지 요청을 한 표로 만드는 절차(npm run matrix).
// - live: 배포 주소로 실제 요청을 보내고 응답 코드와 요청 ID(x-vercel-id)를 기록합니다. 로그인 토큰은 쓰지 않습니다.
// - local: 이 저장소의 판정기(decide)와 탐지(detect)를 가상 요청으로 실제 실행한 결과입니다. 배포 요청이 아닙니다.
// - 미실행: 시험 계정 토큰·서명 키·운영 엔진이 있어야 하는 시험입니다. 통과로 처리하지 않습니다.
// 이 표는 학생 쪽 연습 기록이며 심판 판정이나 41종 시험 전체가 아닙니다.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const ID = '11111111-1111-4111-8111-111111111111';
const FORGED = 'Bearer aaaaaaaa.bbbbbbbb.cccccccc';

const reason = (text) => ({ kind: '미실행', reason: text });
const NEEDS_TOKEN = '시험 계정 A·B 토큰이 필요해 이 표에서는 보내지 않음';

// 요청 모양만 정의합니다. 응답은 실행기가 읽고 expect()가 기대와 대조합니다.
export function liveChecks(base) {
  const json401 = (body) => typeof body?.error === 'string';
  const denied = (status, body) => [401, 403].includes(status) && json401(body);
  return [
    { step: 2, id: 'static_data_empty', request: 'GET /data.json', expected: '공개 파일의 notes가 비어 있음',
      send: ['GET', '/data.json'], expect: (status, body) => status === 200 && Array.isArray(body?.notes) && body.notes.length === 0 },
    { step: 3, id: 'no_token_list', request: 'GET /api/notes (토큰 없음)', expected: '401과 JSON 오류',
      send: ['GET', '/api/notes'], expect: denied },
    { step: 3, id: 'forged_token_list', request: 'GET /api/notes (가짜 토큰)', expected: '401과 JSON 오류',
      send: ['GET', '/api/notes', { Authorization: FORGED }], expect: denied },
    { step: 4, id: 'no_token_item', request: `GET /api/notes/${ID} (토큰 없음)`, expected: '401과 JSON 오류',
      send: ['GET', `/api/notes/${ID}`], expect: denied },
    { step: 4, id: 'no_token_edit', request: `PUT /api/notes/${ID} (토큰 없음)`, expected: '401과 JSON 오류',
      send: ['PUT', `/api/notes/${ID}`, {}, { title: 'x' }], expect: denied },
    { step: 5, id: 'first_page_no_keys', request: 'GET / (첫 화면)', expected: '첫 화면에 서버·공개 키 문자열이 없음',
      send: ['GET', '/'], text: true, expect: (status, body) => status === 200 && !/sb_(?:publishable|secret)_|eyJ[A-Za-z0-9_-]{12,}\.eyJ/u.test(body) },
    { step: 8, id: 'no_token_my_notes', request: 'GET /api/my/notes (토큰 없음)', expected: '401과 JSON 오류',
      send: ['GET', '/api/my/notes'], expect: denied },
    { step: 8, id: 'no_token_notices', request: 'GET /api/notices (토큰 없음)', expected: '401과 JSON 오류',
      send: ['GET', '/api/notices'], expect: denied },
    { step: 10, id: 'no_token_restore', request: `POST /api/restore/${ID} (토큰 없음)`, expected: '401과 JSON 오류',
      send: ['POST', `/api/restore/${ID}`, {}, {}], expect: denied },
    { step: 10, id: 'declared_routes', request: 'GET /aleph.json', expected: 'allowedRoutes에 쓰기 경로는 복구 경로뿐이고 restoreRoute가 문자열',
      send: ['GET', '/aleph.json'], expect: (status, body) => status === 200 && typeof body?.restoreRoute === 'string'
        && Array.isArray(body?.allowedRoutes) && body.allowedRoutes.filter(route => route.method !== 'GET').length === 1 },
    { step: 11, id: 'manifest_served', request: 'GET /manifest.webmanifest', expected: '이름·start_url·display가 있는 JSON',
      send: ['GET', '/manifest.webmanifest'], expect: (status, body) => status === 200 && typeof body?.name === 'string' && body?.display === 'standalone' && typeof body?.start_url === 'string' },
    { step: 11, id: 'no_token_device_status', request: 'GET /api/device/status (토큰 없음)', expected: '401과 JSON 오류',
      send: ['GET', '/api/device/status'], expect: denied },
    { step: 11, id: 'no_token_device_request', request: 'POST /api/device/request (토큰 없음)', expected: '401과 JSON 오류',
      send: ['POST', '/api/device/request', {}, {}], expect: denied },
    { step: 12, id: 'no_token_warroom', request: 'GET /api/warroom/summary (토큰 없음)', expected: '401과 JSON 오류',
      send: ['GET', '/api/warroom/summary'], expect: denied },
  ].map(item => ({ ...item, kind: 'live', base }));
}

// 판정기·탐지를 가상 요청으로 실제 실행합니다(배포 요청이 아님).
export async function localChecks({ decide, detect, fixtureRequests }) {
  const { normal, suspicious } = fixtureRequests();
  const reads = (count, sub = 'learner_a') => Array.from({ length: count }, (_, i) => ({
    at: new Date(Date.UTC(2026, 9, 1) + i * 2000).toISOString(), method: 'GET', identity: { sub } }));
  const decision = async (request) => { const answer = await decide(request); return `${answer.decision}·${answer.reasonCode}`; };
  return [
    { step: 6, id: 'registered_normal_allow', request: '등록 기기의 정상 요청', expected: 'allow·approved', actual: await decision(normal), want: 'allow·approved' },
    { step: 6, id: 'unregistered_denied', request: '미등록 기기의 요청', expected: 'deny·device_not_registered',
      actual: await decision({ ...normal, requestId: randomUUID(), deviceRegistered: false }), want: 'deny·device_not_registered' },
    { step: 7, id: 'unusual_step_up', request: '낯선 시각·네트워크·대량 행동이 겹친 요청', expected: 'step_up·step_up_required',
      actual: await decision(suspicious), want: 'step_up·step_up_required' },
    { step: 8, id: 'write_route_denied', request: 'PUT /notes/:id (선언하지 않은 쓰기 경로)', expected: 'deny·route_not_allowed',
      actual: await decision({ ...normal, requestId: randomUUID(), method: 'PUT', route: 'PUT /notes/:id', path: `/notes/${ID}` }), want: 'deny·route_not_allowed' },
    { step: 8, id: 'zone_mismatch_denied', request: 'notices 서비스로 /notes/:id 요청(구역 넘기)', expected: 'deny·route_not_allowed',
      actual: await decision({ ...normal, requestId: randomUUID(), service: 'notices' }), want: 'deny·route_not_allowed' },
    { step: 8, id: 'other_subject_denied', request: '다른 사용자 표시가 붙은 자료 요청', expected: 'deny·zone_forbidden',
      actual: await decision({ ...normal, requestId: randomUUID(), subjectId: 'learner_a', path: '/notes/memo-learner_b-1' }), want: 'deny·zone_forbidden' },
    { step: 9, id: 'burst_121_proposed', request: '같은 사용자의 GET 121건(10분 안)', expected: 'propose_revocation·burst_read',
      actual: `${detect(reads(121)).action}·${detect(reads(121)).reasonCode}`, want: 'propose_revocation·burst_read' },
    { step: 9, id: 'burst_120_observed', request: '같은 사용자의 GET 120건', expected: 'observe', actual: detect(reads(120)).action, want: 'observe' },
  ].map(item => ({ ...item, kind: 'local', requestId: 'local', result: item.actual === item.want ? 'pass' : 'fail' }));
}

export const notRun = ({ withA = false, withB = false } = {}) => [
  ...(withA ? [] : [{ step: 4, id: 'own_memo_allowed', request: '시험 계정 A가 자기 메모 조회', expected: '200', ...reason(NEEDS_TOKEN) }]),
  ...(withB ? [] : [{ step: 4, id: 'other_memo_denied', request: '시험 계정 B가 A의 메모 조회·수정', expected: '404', ...reason(withA ? '두 번째 시험 계정(B) 정보가 없어 보내지 않음' : NEEDS_TOKEN) }]),
  { step: 8, id: 'student_notice_edit', request: '일반 학생 계정이 강사 공지 수정', expected: '403', ...reason(NEEDS_TOKEN) },
  ...(withA ? [] : [{ step: 10, id: 'restore_one_memo', request: '변조한 메모 한 건 복원', expected: '사본의 ID·소유자·해시와 같음', ...reason(NEEDS_TOKEN) }]),
  { step: 11, id: 'device_approved_flow', request: '승인 요청 → 운영자 승인 → 자료 열림', expected: '승인 전 자료 없음, 승인 뒤 정상', ...reason('운영자 승인 절차를 직접 해 본 기록이 없음') },
  { step: 11, id: 'signed_request_tamper', request: '서명한 요청의 경로·본문 변조', expected: '거부', ...reason('서명 키·검증 코드가 이 저장소에 없고 심판·운영 엔진이 확인') },
  { step: 12, id: 'full_replay_41', request: '41종 공격 전체 재시험', expected: '모두 거부, 정상 요청은 허용', ...reason('심판이 보내며 이 표는 41종 전체가 아님') },
];

// 시험 계정으로 실제 요청을 보내는 점검입니다. 계정 정보는 환경변수로만 받고 출력·저장하지 않으며, 시험용 메모는 끝에 지웁니다.
// A만 있으면 자기 메모와 복구 시험을, B도 있으면 다른 사용자의 메모 요청 시험까지 실행합니다.
export async function authChecks({ base, accounts, fetcher = fetch, now = () => new Date() }) {
  const rows = [];
  const send = async (method, path, token, body) => {
    const response = await fetcher(new URL(path, base), {
      method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json = await response.json().catch(() => null);
    return { status: response.status, json, requestId: response.headers.get('x-vercel-id') ?? '없음' };
  };
  const add = (step, id, request, expected, res, ok, note = '') => rows.push({ step, id, kind: 'live', request, expected,
    actual: `HTTP ${res.status}${note ? ` · ${note}` : ''}`, requestId: res.requestId, checkedAt: now().toISOString(), result: ok ? 'pass' : 'fail' });
  const login = async (account) => {
    const result = await send('POST', '/api/auth/login', null, { email: account.email, password: account.password });
    return result.status === 200 && result.json?.access_token ? result.json.access_token : null;
  };
  const a = await login(accounts.a);
  if (!a) {
    rows.push({ step: 4, id: 'login_a', kind: 'live', request: '시험 계정 A 로그인', expected: '200과 토큰', actual: '로그인하지 못함', requestId: '없음', checkedAt: now().toISOString(), result: 'fail' });
    return rows;
  }
  const b = accounts.b ? await login(accounts.b) : null;
  const ORIGINAL = '매트릭스 시험 원본';
  const TAMPERED = '매트릭스 변조';
  const created = await send('POST', '/api/notes', a, { title: ORIGINAL, body: '가상 시험 메모(곧 삭제)' });
  const id = created.json?.id;
  add(4, 'create_own_memo', '시험 계정 A가 시험용 메모 추가', '201과 메모 ID', created, created.status === 201 && typeof id === 'string');
  if (typeof id !== 'string') return rows;
  try {
    const own = await send('GET', `/api/notes/${id}`, a);
    add(4, 'own_memo_allowed', '시험 계정 A가 자기 메모 조회', '200과 같은 제목', own, own.status === 200 && own.json?.title === ORIGINAL);
    if (b) {
      const read = await send('GET', `/api/notes/${id}`, b);
      add(4, 'other_memo_read_denied', '시험 계정 B가 A의 메모 조회', '404(존재 여부도 알리지 않음)', read, read.status === 404);
      const edit = await send('PUT', `/api/notes/${id}`, b, { title: 'B의 변조' });
      add(4, 'other_memo_edit_denied', '시험 계정 B가 A의 메모 수정', '404', edit, edit.status === 404);
      const restoreOther = await send('POST', `/api/restore/${id}`, b, {});
      add(10, 'other_memo_restore_denied', '시험 계정 B가 A의 메모 복구 호출', '404', restoreOther, restoreOther.status === 404);
      const list = await send('GET', '/api/my/notes', b);
      add(8, 'other_list_excludes', '시험 계정 B의 내 메모 목록', 'A의 메모가 없음', list, list.status === 200 && Array.isArray(list.json) && !list.json.some(item => item.id === id));
      const still = await send('GET', `/api/notes/${id}`, a);
      add(4, 'own_memo_unchanged_after_b', 'B의 시도 뒤 A의 메모', '제목이 그대로', still, still.status === 200 && still.json?.title === ORIGINAL);
    }
    // 10단계: 변조 → 틀린 해시 주장은 거부 → 복구 → 사본과 같은지 확인
    const tamper = await send('PUT', `/api/notes/${id}`, a, { title: TAMPERED, body: '변조된 내용' });
    add(10, 'tamper_own_memo', '시험 계정 A가 자기 시험 메모를 변조', '200', tamper, tamper.status === 200);
    const bad = await send('POST', `/api/restore/${id}`, a, { contentSha256: 'f'.repeat(64) });
    const afterBad = await send('GET', `/api/notes/${id}`, a);
    add(10, 'restore_bad_hash_refused', '틀린 해시를 주장하며 복구 호출', '409로 거부하고 변조 상태 그대로', bad,
      bad.status === 409 && afterBad.json?.title === TAMPERED, `거부 뒤 제목 ${afterBad.json?.title === TAMPERED ? '그대로' : '바뀜'}`);
    const restored = await send('POST', `/api/restore/${id}`, a, {});
    const after = await send('GET', `/api/notes/${id}`, a);
    const okRestore = restored.status === 200 && restored.json?.restored === true && restored.json?.verified === true && after.json?.title === ORIGINAL;
    add(10, 'restore_one_memo', '변조한 메모 한 건 복구', '200, 검증됨, 제목이 사본(원본)과 같음', restored, okRestore,
      `검증 ${restored.json?.verified ? '예' : '아니오'}, 감사 기록 ${restored.json?.auditRecorded ? '남음' : '없음'}, 복구 뒤 제목 ${after.json?.title === ORIGINAL ? '원본과 같음' : '다름'}`);
    add(10, 'restore_audit_recorded', '복구가 감사 기록에 남았는지(응답의 감사 기록 번호)', 'auditRecorded true', restored, restored.json?.auditRecorded === true);
    const summary = await send('GET', '/api/warroom/summary', a);
    const room = summary.json?.restore;
    add(12, 'warroom_matches', '작전실 요약의 복구 기록', '복구 1 이상, 사본이 메모 수 이상', summary,
      summary.status === 200 && room?.restoresRecorded >= 1 && room?.backupCoversMemos === true,
      `메모 ${room?.memos}, 사본 ${room?.backups}, 복구 ${room?.restoresRecorded}`);
  } finally {
    await send('DELETE', `/api/notes/${id}`, a).catch(() => null);
  }
  return rows;
}

export async function runLive(checks, { fetcher = fetch, now = () => new Date() } = {}) {
  const rows = [];
  for (const item of checks) {
    const [method, path, headers = {}, body] = item.send;
    const base = { step: item.step, id: item.id, kind: 'live', request: item.request, expected: item.expected, checkedAt: now().toISOString() };
    try {
      const response = await fetcher(new URL(path, item.base), {
        method, redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      let parsed = text;
      if (!item.text) { try { parsed = JSON.parse(text); } catch { parsed = null; } }
      const ok = Boolean(item.expect(response.status, parsed));
      rows.push({ ...base, actual: `HTTP ${response.status}`, requestId: response.headers.get('x-vercel-id') ?? '없음', result: ok ? 'pass' : 'fail' });
    } catch (error) {
      rows.push({ ...base, actual: `요청 실패: ${error.cause?.code ?? error.message}`.slice(0, 80), requestId: '없음', result: 'fail' });
    }
  }
  return rows;
}

export function render(rows, checkedAt) {
  const cell = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
  const lines = ['| 단계 | 구분 | 요청 | 기대 결과 | 실제 결과 | 요청 ID | 확인 시각 | 판정 |', '|---|---|---|---|---|---|---|---|'];
  for (const row of rows) {
    const actual = row.kind === '미실행' ? `미실행: ${row.reason}` : row.actual;
    lines.push(`| ${row.step} | ${row.kind} | ${cell(row.request)} | ${cell(row.expected)} | ${cell(actual)} | ${cell(row.requestId ?? '-')} | ${cell(row.checkedAt ?? checkedAt)} | ${row.result ?? '미실행'} |`);
  }
  const count = (result) => rows.filter(row => (row.result ?? '미실행') === result).length;
  lines.push('', `실행 ${count('pass') + count('fail')}개(통과 ${count('pass')}, 실패 ${count('fail')}), 미실행 ${count('미실행')}개. 이 표는 41종 시험 전체가 아니며 심판 판정이 아닙니다.`);
  return lines.join('\n');
}

async function main(args) {
  const config = JSON.parse(await readFile(resolve(root, 'aleph.config.json'), 'utf8'));
  const urlArg = args.find(arg => arg.startsWith('--url='))?.slice(6);
  const base = new URL(urlArg ?? config.publicAppUrl);
  const { decide } = await import(pathToFileURL(resolve(root, 'src', 'decider.mjs')).href);
  const { detect } = await import(pathToFileURL(resolve(root, 'src', 'detect.mjs')).href);
  const { fixtureRequests } = await import(pathToFileURL(resolve(root, 'scripts', 'fixture-7.mjs')).href);
  const checkedAt = new Date().toISOString();
  const env = process.env;
  const accounts = {
    a: env.MATRIX_A_EMAIL && env.MATRIX_A_PASSWORD ? { email: env.MATRIX_A_EMAIL, password: env.MATRIX_A_PASSWORD } : null,
    b: env.MATRIX_B_EMAIL && env.MATRIX_B_PASSWORD ? { email: env.MATRIX_B_EMAIL, password: env.MATRIX_B_PASSWORD } : null,
  };
  const authRows = accounts.a ? await authChecks({ base, accounts }) : [];
  const rows = [...await runLive(liveChecks(base)), ...authRows, ...await localChecks({ decide, detect, fixtureRequests }),
    ...notRun({ withA: Boolean(accounts.a), withB: Boolean(accounts.a && accounts.b) })]
    .sort((a, b) => a.step - b.step);
  const table = render(rows, checkedAt);
  process.stdout.write(`${table}\n`);
  await mkdir(resolve(root, 'artifacts'), { recursive: true });
  await writeFile(resolve(root, 'artifacts', 'replay-matrix.md'), `${table}\n`, 'utf8');
  await writeFile(resolve(root, 'artifacts', 'replay-matrix.json'), `${JSON.stringify({ schema: 'aleph.replay.v1', checkedAt, base: base.origin, rows }, null, 2)}\n`, 'utf8');
  if (rows.some(row => row.result === 'fail')) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => { process.stderr.write(`재시험 표 첫 오류: ${error.message}\n`); process.exitCode = 1; });
}
