import { contentHash, createRestoreApi } from './restore.mjs';

// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
// 10단계: 복구 로직을 메모리 DB에서 직접 실행합니다. 배포로 보낸 요청이 아니며, 실제로 돌려 본 결과만 돌려줍니다.
export async function simulateRestore() {
  const { info, warn } = console;
  console.info = () => {}; console.warn = () => {};
  try { return await runSimulation(); } finally { console.info = info; console.warn = warn; }
}

async function runSimulation() {
  const B = '22222222-2222-4222-8222-222222222222';
  const [M1, M2] = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'];
  const memo = (id, title, body) => ({ id, owner_id: B, title, body, zone: 'memo' });
  const rows = new Map([[M1, memo(M1, '원본', '가상 원본')], [M2, memo(M2, '다른 메모', '가상 다른 메모')]]);
  const backups = new Map([...rows.values()].map(r => [r.id, { memo_id: r.id, owner_id: B, title: r.title, body: r.body,
    content_sha256: contentHash(r) }]));
  const audit = [{ action: 'earlier' }];
  const restore = createRestoreApi({
    verify: async () => ({ userId: B }),
    db: { getBackup: async id => backups.get(id) ?? null, getRow: async id => (rows.has(id) ? { ...rows.get(id) } : null),
      restoreMemo: async row => { rows.set(row.id, { ...row, zone: 'memo' }); },
      audit: async entry => { audit.push(entry); return { id: audit.length }; } },
  });
  const call = (request) => new Promise((resolve) => {
    restore({ method: 'POST', headers: { authorization: 'Bearer local' }, query: {}, ...request },
      { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { resolve({ status: this.code, body }); } });
  });
  const other = { ...rows.get(M2) };
  rows.get(M1).title = '변조'; rows.get(M1).body = '변조된 내용';
  const refused = await call({ query: { id: M1 }, body: { contentSha256: 'f'.repeat(64) } });
  const stayed = rows.get(M1).title === '변조';
  const done = await call({ query: { id: M1 } });
  rows.delete(M1);
  const again = await call({ query: { id: M1 } });
  return {
    refusedMismatch: refused.status === 409 && stayed,
    restoredTampered: done.status === 200 && done.body.restored === true,
    restoredDeleted: again.status === 200 && again.body.restored === true,
    sameAsBackup: contentHash(rows.get(M1)) === backups.get(M1).content_sha256,
    othersKept: JSON.stringify(rows.get(M2)) === JSON.stringify(other) && rows.size === 2,
    auditKept: audit[0].action === 'earlier' && audit.filter(entry => entry.action === 'restore').length === 2
      && audit.some(entry => entry.action === 'restore_refused'),
  };
}

// 점검이 보내는 모든 요청에 그 점검의 attackId를 붙입니다(요청 헤더 X-Attack-Id·X-Aleph-Attack-Id, User-Agent, 주소 쿼리 attackId).
// 그래야 실행 기록(어떤 요청이 어떤 점검의 것인지)을 대조할 수 있습니다. 읽기(GET) 요청만 보냅니다.
function probe(attackId, url, options = {}) {
  const target = new URL(url);
  target.searchParams.set('attackId', attackId);
  return fetch(target, {
    redirect: 'error', signal: AbortSignal.timeout(10000), ...options,
    headers: { ...(options.headers ?? {}), 'X-Attack-Id': attackId, 'X-Aleph-Attack-Id': attackId, 'User-Agent': `aleph-attack-check/${attackId}` },
  });
}

// 제출 묶음은 읽기 요청만 보낼 수 있고, 실행하지 않은 점검은 observed를 not_run으로 둡니다(사유는 expected에 덧붙입니다).
export async function runAttackChecks(config) {
  const attempts = await collectAttackChecks(config);
  return attempts.map((item) => {
    if (!item.observed.startsWith('미실행')) return item;
    const reason = item.observed.replace(/^미실행:?\s*/u, '');
    return { ...item, expected: `${item.expected} (미실행 사유: ${reason})`.slice(0, 300), observed: 'not_run' };
  });
}

async function collectAttackChecks(config) {
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  // 1~2단계의 공개 파일 점검에만 쓰는 요청입니다(3단계부터는 보내지 않습니다).
  const response = config.step <= 2
    ? await probe(config.step === 1 ? 'anonymous_note_read' : 'static_note_seed', new URL('/data.json', app)) : null;
  if (config.step >= 3) {
    // 3~5단계: 로그인 없이, 그리고 가짜 토큰으로 자료 API를 부르면 JSON 오류로 거부되어야 합니다.
    const ask = async (attackId, headers) => {
      const reply = await probe(attackId, new URL('/api/notes', app), { headers });
      let jsonError = false;
      try { jsonError = typeof (await reply.json())?.error === 'string'; } catch { /* 비JSON은 실패 */ }
      return { denied: [401, 403].includes(reply.status) && jsonError, status: reply.status };
    };
    const anonymous = await ask('no_token_list', {});
    const forged = await ask('forged_token_list', { Authorization: 'Bearer aaaaaaaa.bbbbbbbb.cccccccc' });
    const extra = [];
    if (config.step >= 5) {
      // 화면 파일에 서버 전용 키·공개 키가 없는지 실제로 내려받아 확인합니다. (값은 기록하지 않습니다.)
      const page = await probe('browser_bundle_keys', new URL('/', app));
      const html = await page.text();
      const leaked = /sb_(?:publishable|secret)_|eyJ[A-Za-z0-9_-]{12,}\.eyJ/u.test(html);
      extra.push({ attackId: 'browser_bundle_keys', expected: '첫 화면 파일에 Supabase 키가 없음',
        observed: leaked ? '첫 화면 파일에서 키로 보이는 문자열이 발견됨' : '첫 화면 파일에서 Supabase 키 문자열이 발견되지 않음' });
      // 원본 자료 API를 공개 키로 직접 부르는 시험은 공개 키가 환경변수에 있을 때만 실행합니다.
      const key = process.env.SUPABASE_PUBLISHABLE_KEY;
      if (key && typeof config.originalApiUrl === 'string') {
        const direct = await probe('direct_origin_read', `${config.originalApiUrl}?select=id&limit=1`, {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
        });
        let rows = null;
        try { rows = await direct.json(); } catch { /* 비JSON은 거부로 봅니다. */ }
        const exposed = direct.ok && Array.isArray(rows) && rows.length > 0;
        extra.push({ attackId: 'direct_origin_read', expected: '공개 키로 원본 자료 API를 직접 조회해도 메모가 없음',
          observed: exposed ? '공개 키 직접 조회에서 메모가 응답됨' : `공개 키 직접 조회에서 메모가 응답되지 않음 (HTTP ${direct.status})` });
      } else {
        extra.push({ attackId: 'direct_origin_read', expected: '공개 키로 원본 자료 API를 직접 조회해도 메모가 없음',
          observed: '미실행: SUPABASE_PUBLISHABLE_KEY 환경변수가 없어 직접 조회를 보내지 않음' });
      }
    }
    if (config.step >= 6) {
      // 6단계: 미등록 기기 공격은 운영 엔진·심판만 보낼 수 있어 학생 쪽에서는 보내지 않습니다.
      extra.push({ attackId: 'unregistered_device', expected: '등록되지 않은 기기의 요청은 판정기가 device_not_registered로 거부',
        observed: '미실행: 미등록 기기 요청은 심판이 보내며 학생 쪽 점검에서는 보내지 않음 (가상 연습은 npm run decider:test)' });
    }
    if (config.step >= 7) {
      // 7단계: 이상 접속 신호와 재로그인 확인은 엔진·심판이 보내며, 재로그인 시각 계약은 현재 없습니다.
      extra.push({ attackId: 'unusual_access_step_up', expected: '시각·네트워크·대량 행동이 겹친 가상 접속은 판정기가 step_up_required로 응답',
        observed: '미실행: 이상 접속 사건은 심판이 보내며 학생 쪽 점검에서는 보내지 않음 (가상 연습은 npm run decider:test)' });
      extra.push({ attackId: 'relogin_block_before_verify', expected: '추가 확인 전에는 자료가 막히고 새 로그인 뒤 요청이 허용됨',
        observed: '미실행: 제공 엔진에 재로그인 시각 확인 계약이 없어 실제 자료 차단은 시험하지 않음' });
    }
    if (config.step >= 8) {
      // 8단계: 다른 구역 시험은 서로 다른 두 시험 계정의 토큰이 필요해 학생 쪽 점검에서는 보내지 않습니다.
      extra.push({ attackId: 'cross_zone_memo_access', expected: '다른 사용자의 메모를 API로 조회·수정하면 거부(404)',
        observed: '미실행: 두 번째 시험 계정 토큰이 없어 보내지 않음 (자료 API 단위 시험은 npm run test:notes)' });
      extra.push({ attackId: 'student_notice_edit', expected: '일반 학생 계정이 강사 공지를 수정하면 거부(403)',
        observed: '미실행: 시험 계정 토큰이 없어 보내지 않음 (자료 API 단위 시험은 npm run test:notes)' });
    }
    if (config.step >= 9) {
      // 9단계: 가상 도플갱어 사건과 실제 회수·경과 시간은 심판이 확인합니다. 학생 쪽 점검은 사건을 보내지 않습니다.
      extra.push({ attackId: 'burst_read_detection', expected: '같은 사용자의 GET이 10분 안에 120건을 넘으면 propose_revocation(burst_read)',
        observed: '미실행: 가상 도플갱어 사건은 심판이 보내며 학생 쪽 점검에서는 보내지 않음 (가상 연습은 npm run detect:test)' });
      extra.push({ attackId: 'revocation_enforced', expected: '회수 제안 뒤 같은 신원의 다음 요청이 거부됨',
        observed: '미실행: 실제 회수와 경과 시간은 운영 엔진·심판이 확인하며 이 저장소에는 회수 API가 없음' });
    }
    if (config.step >= 10) {
      // 10단계: 제출 묶음은 읽기(GET·HEAD) 요청만 보낼 수 있습니다. 복구 경로(POST 전용)를 읽기로 부르면 405로 거부되는지만 확인하고,
      // 로그인 없는 POST 복구 요청의 거부(401)는 쓰기 요청이라 이 점검에서 보내지 않습니다(npm run matrix가 보냅니다).
      const restore = await probe('restore_get_refused', new URL('/api/restore/11111111-1111-4111-8111-111111111111', app), { method: 'GET' });
      let restoreJson = false;
      try { restoreJson = typeof (await restore.json())?.error === 'string'; } catch { /* 비JSON은 실패 */ }
      extra.push({ attackId: 'restore_get_refused', expected: '복구 경로를 읽기(GET)로 부르면 405와 JSON 오류(복구는 POST와 로그인만 받음)',
        observed: restore.status === 405 && restoreJson
          ? `거부됨 (HTTP ${restore.status}, JSON 오류)` : `거부되지 않음 (HTTP ${restore.status})` });
      const sim = await simulateRestore();
      const ok = (value) => (value ? '통과' : '실패');
      // 요청을 보내지 않는 점검이므로 observed는 not_run으로 두고, 로컬에서 실제로 돌려 본 결과는 expected 쪽에 적습니다.
      extra.push({ attackId: 'restore_local_simulation', expected: `로컬 모의 실행(메모리 DB, 배포 요청 아님) 결과: 해시 불일치 거부 ${ok(sim.refusedMismatch)}, 변조 복원 ${ok(sim.restoredTampered)}, 삭제 복원 ${ok(sim.restoredDeleted)}, 사본과 일치 ${ok(sim.sameAsBackup)}, 다른 메모 보존 ${ok(sim.othersKept)}, 감사 기록 보존 ${ok(sim.auditKept)}`,
        observed: '미실행: 요청을 보내지 않음' });
      extra.push({ attackId: 'restore_one_memo_verified', expected: '시험 계정 B의 변조·삭제된 메모 한 건이 사본의 ID·소유자·해시와 같게 복원됨',
        observed: '미실행: 시험 계정 B의 토큰이 없어 보내지 않음 (복원 로직 단위 시험은 node --test test/restore-api.test.mjs)' });
      if (config.step < 12) {
        extra.push({ attackId: 'replay_steps_1_to_9', expected: '복구 직후 1~9단계의 대표 공격 요청이 다시 거부됨',
          observed: '미실행: 1~9단계 전체 재시험은 심판이 보내며 학생 쪽 점검은 비로그인·가짜 토큰 요청만 보냄' });
      }
    }
    if (config.step >= 11) {
      // 11단계: 설치형 앱 설정이 실제로 내려오는지, 승인 상태 API가 로그인 없이는 거부되는지만 실제로 보냅니다.
      const manifestReply = await probe('app_manifest_served', new URL('/manifest.webmanifest', app));
      let manifest = null;
      try { manifest = await manifestReply.json(); } catch { /* 비JSON은 실패 */ }
      const manifestOk = manifestReply.ok && typeof manifest?.name === 'string' && manifest?.display === 'standalone' && typeof manifest?.start_url === 'string';
      extra.push({ attackId: 'app_manifest_served', expected: '/manifest.webmanifest가 이름·start_url·display(standalone)가 있는 JSON으로 내려옴',
        observed: manifestOk ? `확인됨 (HTTP ${manifestReply.status}, name·start_url·display 있음)` : `확인하지 못함 (HTTP ${manifestReply.status})` });
      const deviceReply = await probe('device_status_requires_login', new URL('/api/device/status', app));
      let deviceJson = false;
      try { deviceJson = typeof (await deviceReply.json())?.error === 'string'; } catch { /* 비JSON은 실패 */ }
      extra.push({ attackId: 'device_status_requires_login', expected: '로그인 없이 기기 승인 상태를 요청하면 401과 JSON 오류',
        observed: [401, 403].includes(deviceReply.status) && deviceJson
          ? `거부됨 (HTTP ${deviceReply.status}, JSON 오류)` : `거부되지 않음 (HTTP ${deviceReply.status})` });
      extra.push({ attackId: 'unsigned_protected_request', expected: '앱 서명 없이 보호 요청을 보내면 거부',
        observed: '미실행: 서명 검증은 운영 엔진과 심판이 하며 이 저장소에는 서명 키·검증 코드가 없음' });
      extra.push({ attackId: 'signed_request_tampered', expected: '서명한 뒤 경로나 본문을 바꾼 요청은 거부',
        observed: '미실행: 서명한 요청의 변조 시험은 심판이 보내며 학생 쪽 점검에서는 보내지 않음' });
    }
    if (config.step >= 12) {
      // 12단계: 작전실 요약 API가 로그인 없이는 거부되는지만 실제로 보냅니다. 전체 재시험 표는 npm run matrix가 만듭니다.
      const room = await probe('warroom_requires_login', new URL('/api/warroom/summary', app));
      let roomJson = false;
      try { roomJson = typeof (await room.json())?.error === 'string'; } catch { /* 비JSON은 실패 */ }
      extra.push({ attackId: 'warroom_requires_login', expected: '로그인 없이 작전실 요약을 요청하면 401과 JSON 오류',
        observed: [401, 403].includes(room.status) && roomJson ? `거부됨 (HTTP ${room.status}, JSON 오류)` : `거부되지 않음 (HTTP ${room.status})` });
      extra.push({ attackId: 'full_replay_41', expected: '41종 공격 전체가 거부되고 정상 요청은 허용됨',
        observed: '미실행: 41종 전체 재시험은 심판이 보내며 이 저장소의 npm run matrix는 그 일부(토큰 없는 요청과 로컬 판정·탐지)만 실행함' });
    }
    return [
      { attackId: 'no_token_list', expected: '로그인 없이 메모 목록을 요청하면 401 또는 403과 JSON 오류',
        observed: anonymous.denied ? `거부됨 (HTTP ${anonymous.status}, JSON 오류)` : `거부되지 않음 (HTTP ${anonymous.status})` },
      { attackId: 'forged_token_list', expected: '서명이 맞지 않는 가짜 토큰으로 요청하면 거부',
        observed: forged.denied ? `거부됨 (HTTP ${forged.status}, JSON 오류)` : `거부되지 않음 (HTTP ${forged.status})` },
      ...extra,
    ];
  }
  if (config.step === 2) {
    // 2단계: 공개 정적 파일에는 메모가 없어야 하고, 서버 API는 아직 비로그인으로 열려 있습니다.
    let staticEmpty = false;
    if (response.ok) {
      try {
        const data = await response.json();
        staticEmpty = Array.isArray(data?.notes) && data.notes.length === 0;
      } catch {
        // 비JSON 응답은 확인 실패로 둡니다.
      }
    }
    const api = await probe('anonymous_api_read', new URL('/api/notes', app));
    let apiOpen = false;
    if (api.ok) {
      try {
        const body = await api.json();
        apiOpen = Array.isArray(body?.notes) && body.notes.length > 0;
      } catch {
        // 비JSON 응답은 확인 실패로 둡니다.
      }
    }
    return [
      { attackId: 'static_note_seed', expected: '공개 정적 파일에서 메모 본문이 보이지 않음',
        observed: staticEmpty ? '/data.json의 notes가 비어 있음' : `/data.json에서 비어 있는 notes를 확인하지 못함 (HTTP ${response.status})` },
      { attackId: 'anonymous_api_read', expected: '비로그인 서버 API 호출로 가상 메모를 읽는지 확인(3단계 전 남은 약점)',
        observed: apiOpen ? '비로그인 /api/notes 요청에서 가상 메모가 응답됨' : `비로그인 /api/notes 요청에서 메모가 응답되지 않음 (HTTP ${api.status})` },
    ];
  }
  let visible = false;
  if (response.ok) {
    try {
      const data = await response.json();
      visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
        && data.notes.length > 0;
    } catch {
      // A non-JSON response is a failed check, not a successful deployment.
    }
  }
  return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
    observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
}
