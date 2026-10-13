// 10단계: 검증한 메모 사본에서 지정한 한 건만 복원하는 POST /api/restore/:id (또는 /api/restore + 본문 id) 처리부.
// 로그인 검사(verify)와 저장소(db)를 주입받아 단위 시험이 가능합니다. 응답과 감사 기록에는 메모 내용을 싣지 않습니다.
import { createHash } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SHA256 = /^[0-9a-f]{64}$/u;

// db/backup-restore.sql의 사본 해시와 같은 식: sha256(메모ID|소유자ID|제목|본문)
export const contentHash = ({ id, owner_id: owner, title, body }) =>
  createHash('sha256').update(`${id}|${owner}|${title}|${body}`, 'utf8').digest('hex');

function send(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  return response.status(status).json(body);
}

const first = (source, names) => names.map(name => source?.[name]).find(value => value !== undefined);

// 요청이 함께 보낸 소유자·해시·내용 주장. 있으면 사본과 같아야 하고, 하나라도 다르면 복원하지 않습니다.
function claimsOf(body, id, backup) {
  const owner = first(body, ['owner_id', 'ownerId', 'owner']);
  const hash = first(body, ['contentSha256', 'content_sha256', 'sha256', 'contentHash', 'hash']);
  const title = body?.title;
  const text = body?.body;
  const problems = [];
  if (owner !== undefined && owner !== backup.owner_id) problems.push('owner');
  if (hash !== undefined) {
    const normalized = String(hash).toLowerCase().replace(/^sha256:/u, '');
    if (!SHA256.test(normalized) || normalized !== backup.content_sha256) problems.push('hash');
  }
  if (title !== undefined || text !== undefined) {
    const claimed = contentHash({ id, owner_id: backup.owner_id, title: title ?? backup.title, body: text ?? backup.body });
    if (claimed !== backup.content_sha256) problems.push('content');
  }
  return problems;
}

export function createRestoreApi({ verify, db }) {
  return async function restore(request, response) {
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
    }
    try {
      const who = await verify(request.headers?.authorization);
      if (!who) return send(response, 401, { error: 'LOGIN_REQUIRED', message: '로그인이 필요합니다.' });
      const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body) ? request.body : {};
      // 요청 모양 기록: 경로 항목과 본문의 항목 이름만 남기고, 값·토큰·메모 내용은 남기지 않습니다.
      console.info('restore request shape', JSON.stringify({ path: typeof request.query?.id, queryKeys: Object.keys(request.query ?? {}).slice(0, 10),
        bodyKeys: Object.keys(body).slice(0, 20), who: who.kind ?? 'student' }));
      // 복원할 메모는 한 건뿐입니다. 경로의 ID를 쓰고, 경로가 ':id' 그대로 오면 본문의 id를 씁니다. 둘 다 있으면 같아야 합니다.
      const fromPath = request.query?.id;
      const fromBody = body.id;
      const id = String(UUID.test(String(fromPath ?? '')) ? fromPath : fromBody ?? '');
      if (!UUID.test(id) || (UUID.test(String(fromPath ?? '')) && fromBody !== undefined && fromBody !== fromPath)) {
        return send(response, 400, { error: 'INVALID_INPUT' });
      }
      const backup = await db.getBackup(id);
      // 사본이 없거나 남의 메모면 없는 것과 똑같이 404로 답하고 멈춥니다.
      if (!backup || backup.owner_id !== who.userId) return send(response, 404, { error: 'NO_BACKUP', verified: false });
      // 사본을 다시 읽어 ID·소유자·내용 해시를 검증합니다. 실패하면 복원하지 않고 이유만 감사 기록에 남깁니다.
      const expected = contentHash({ id: backup.memo_id, owner_id: backup.owner_id, title: backup.title, body: backup.body });
      const problems = backup.memo_id === id && expected === backup.content_sha256 ? claimsOf(body, id, backup) : ['backup'];
      if (problems.length) {
        console.warn('restore refused', id, problems.join(','));
        const audited = await db.audit({ action: 'restore_refused', memo_id: id, owner_id: backup.owner_id, detail: { problems } });
        return send(response, 409, { error: 'BACKUP_INVALID', message: '사본 검증에 실패해 복원하지 않았습니다.',
          verified: false, restored: false, problems, auditId: audited?.id ?? null, auditRecorded: Boolean(audited) });
      }
      const current = await db.getRow(id);
      if (current && current.owner_id !== backup.owner_id) {
        console.warn('restore refused', id, 'owner_mismatch');
        const audited = await db.audit({ action: 'restore_refused', memo_id: id, owner_id: backup.owner_id, detail: { problems: ['current_owner'] } });
        return send(response, 409, { error: 'OWNER_MISMATCH', message: '다른 소유자의 메모는 덮어쓰지 않습니다.',
          verified: true, restored: false, auditId: audited?.id ?? null, auditRecorded: Boolean(audited) });
      }
      const before = current ? contentHash(current) : null;
      // 바뀔 항목(내용은 싣지 않습니다). dryRun이면 여기서 멈추고 아무것도 바꾸지 않습니다.
      const plan = { existed: Boolean(current), unchanged: before === backup.content_sha256,
        changes: current ? ['title', 'body'].filter(field => current[field] !== backup[field]) : ['create'] };
      const view = { id, ownerId: backup.owner_id, owner_id: backup.owner_id, verified: true,
        contentSha256: backup.content_sha256, backedUpAt: backup.backed_up_at ?? null, plan };
      if (body.dryRun === true || request.query?.dryRun === 'true') {
        return send(response, 200, { ...view, restored: false, dryRun: true });
      }
      if (plan.unchanged) return send(response, 200, { ...view, restored: false });
      await db.restoreMemo({ id, owner_id: backup.owner_id, title: backup.title, body: backup.body });
      const audited = await db.audit({ action: 'restore', memo_id: id, owner_id: backup.owner_id,
        detail: { existed: plan.existed, changes: plan.changes, beforeSha256: before, afterSha256: backup.content_sha256 } });
      return send(response, 200, { ...view, restored: true, auditId: audited?.id ?? null, auditRecorded: Boolean(audited) });
    } catch (error) {
      console.error('restore failed', error?.code ?? 'unknown');
      return send(response, 502, { error: 'RESTORE_UNAVAILABLE' });
    }
  };
}
