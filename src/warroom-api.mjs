// 12단계: 탈환 작전실 요약 API 처리부. 로그인한 사용자 본인의 서버 기록을 집계한 숫자만 돌려줍니다.
// 메모 제목·본문·토큰·기기 키는 읽지도 돌려주지도 않습니다. 코드에서 읽은 값(source: 'code')과
// 서버 기록에서 읽은 값(source: 'server')을 구분하고, 확인하지 않은 항목은 '미실행'으로 표시합니다.
import { RULE_IDS, ZONE_ROUTES } from './decider.mjs';
import { stateOf } from './device-api.mjs';

function send(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  return response.status(status).json(body);
}

const countBy = (items, key) => items.reduce((sum, item) => ({ ...sum, [item[key]]: (sum[item[key]] ?? 0) + 1 }), {});

// db.warRoomRecords(userId) → { memos, backups, audit: [{action, at}], approvals: [{status}] } (본문 없이 숫자·시각만)
export function summarize(records, now = new Date()) {
  const audit = countBy(records.audit, 'action');
  const lastRestore = records.audit.find(entry => entry.action === 'restore')?.at ?? null;
  return {
    schema: 'aleph.warroom.v1',
    generatedAt: now.toISOString(),
    rules: { source: 'code', decider: [...RULE_IDS], routes: ZONE_ROUTES.map(route => `${route.method} ${route.pathPattern}`) },
    detection: { source: 'code', rule: 'burst_read', limit: 120, windowMinutes: 10,
      liveEvents: '미실행: 사건 전달과 회수 집행은 운영 엔진·심판이 하며 이 서버에는 사건 기록이 없습니다.' },
    revocation: { source: 'code', proposalsOnly: true,
      enforced: '미실행: 이 저장소에는 회수 API가 없고 회수 제안(propose_revocation)만 만듭니다.' },
    restore: { source: 'server', memos: records.memos, backups: records.backups,
      restoresRecorded: audit.restore ?? 0, refusalsRecorded: audit.restore_refused ?? 0, lastRestoreAt: lastRestore,
      backupCoversMemos: records.backups >= records.memos },
    device: { source: 'server', state: stateOf(records.approvals), requests: countBy(records.approvals, 'status') },
    notShown: ['메모 제목·본문', '로그인 토큰', '기기 키'],
  };
}

export function createWarRoomApi({ verify, db }) {
  return async function warRoom(request, response) {
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
    }
    try {
      const who = await verify(request.headers?.authorization);
      if (!who) return send(response, 401, { error: 'LOGIN_REQUIRED', message: '로그인이 필요합니다.' });
      return send(response, 200, summarize(await db.warRoomRecords(who.userId)));
    } catch (error) {
      console.error('war room failed', error?.code ?? 'unknown');
      return send(response, 502, { error: 'WARROOM_UNAVAILABLE' });
    }
  };
}
