// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (![1, 2].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
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
