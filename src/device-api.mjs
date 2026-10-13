// 11단계: 기기 승인 상태 조회·승인 요청 API 처리부. 로그인 검사(verify)와 저장소(db)를 주입받아 단위 시험이 가능합니다.
// 승인은 서버 쪽 기록(defense_device_approvals)이 정합니다. 이 API는 요청 기록을 만들고 읽을 뿐 승인할 수 없습니다.
// 기기 키·토큰은 받지도 저장하지도 않습니다. 설치 표시나 요청 본문의 값으로 권한을 주지 않습니다.
const MAX_LABEL = 60;

function send(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  return response.status(status).json(body);
}

// 사용자의 요청 기록에서 상태를 정합니다: 승인된 요청이 있으면 approved, 없고 대기가 있으면 pending, 아니면 none.
export function stateOf(rows) {
  if (rows.some(row => row.status === 'approved')) return 'approved';
  if (rows.some(row => row.status === 'pending')) return 'pending';
  return 'none';
}

const cleanLabel = (value) => (typeof value === 'string'
  ? value.replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, MAX_LABEL) : '');

export function createDeviceApi({ verify, db }) {
  async function guarded(request, response, allowed, run) {
    if (request.method !== allowed) {
      response.setHeader('Allow', allowed);
      return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
    }
    try {
      const who = await verify(request.headers?.authorization);
      if (!who) return send(response, 401, { error: 'LOGIN_REQUIRED', message: '로그인이 필요합니다.' });
      return await run(who);
    } catch (error) {
      console.error('device api failed', error?.code ?? 'unknown');
      return send(response, 502, { error: 'DEVICE_UNAVAILABLE', state: 'unavailable' });
    }
  }

  const status = (request, response) => guarded(request, response, 'GET', async (who) => {
    const rows = await db.listApprovals(who.userId);
    const latest = rows.find(row => row.status === 'pending') ?? null;
    return send(response, 200, { state: stateOf(rows), requestId: latest?.request_id ?? null });
  });

  const requestApproval = (request, response) => guarded(request, response, 'POST', async (who) => {
    const rows = await db.listApprovals(who.userId);
    if (rows.some(row => row.status === 'approved')) {
      return send(response, 200, { state: 'approved', requestId: null, created: false });
    }
    const pending = rows.find(row => row.status === 'pending');
    if (pending) return send(response, 200, { state: 'pending', requestId: pending.request_id, created: false });
    const created = await db.createApproval({ user_id: who.userId, label: cleanLabel(request.body?.label), status: 'pending' });
    return send(response, 201, { state: 'pending', requestId: created.request_id, created: true });
  });

  return { status, requestApproval };
}
