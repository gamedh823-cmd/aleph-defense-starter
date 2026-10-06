// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (![1, 2, 3, 4, 5].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
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
  const response = await fetch(new URL('/data.json', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  if (config.step >= 3) {
    // 3~5단계: 로그인 없이, 그리고 가짜 토큰으로 자료 API를 부르면 JSON 오류로 거부되어야 합니다.
    const ask = async (headers) => {
      const reply = await fetch(new URL('/api/notes', app), {
        headers, redirect: 'error', signal: AbortSignal.timeout(10000),
      });
      let jsonError = false;
      try { jsonError = typeof (await reply.json())?.error === 'string'; } catch { /* 비JSON은 실패 */ }
      return { denied: [401, 403].includes(reply.status) && jsonError, status: reply.status };
    };
    const anonymous = await ask({});
    const forged = await ask({ Authorization: 'Bearer aaaaaaaa.bbbbbbbb.cccccccc' });
    const extra = [];
    if (config.step === 5) {
      // 화면 파일에 서버 전용 키·공개 키가 없는지 실제로 내려받아 확인합니다. (값은 기록하지 않습니다.)
      const page = await fetch(new URL('/', app), { redirect: 'error', signal: AbortSignal.timeout(10000) });
      const html = await page.text();
      const leaked = /sb_(?:publishable|secret)_|eyJ[A-Za-z0-9_-]{12,}\.eyJ/u.test(html);
      extra.push({ attackId: 'browser_bundle_keys', expected: '첫 화면 파일에 Supabase 키가 없음',
        observed: leaked ? '첫 화면 파일에서 키로 보이는 문자열이 발견됨' : '첫 화면 파일에서 Supabase 키 문자열이 발견되지 않음' });
      // 원본 자료 API를 공개 키로 직접 부르는 시험은 공개 키가 환경변수에 있을 때만 실행합니다.
      const key = process.env.SUPABASE_PUBLISHABLE_KEY;
      if (key && typeof config.originalApiUrl === 'string') {
        const direct = await fetch(`${config.originalApiUrl}?select=id&limit=1`, {
          headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000),
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
    const api = await fetch(new URL('/api/notes', app), {
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
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
