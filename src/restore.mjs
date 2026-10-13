// 10단계: 검증한 메모 사본에서 지정한 한 건만 복원하는 POST /api/restore/:id 처리부.
// 로그인 검사(verify)와 저장소(db)를 주입받아 단위 시험이 가능합니다. 응답에는 메모 내용을 싣지 않습니다.
import { createHash } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

// db/backup-restore.sql의 사본 해시와 같은 식: sha256(메모ID|소유자ID|제목|본문)
export const contentHash = ({ id, owner_id: owner, title, body }) =>
  createHash('sha256').update(`${id}|${owner}|${title}|${body}`, 'utf8').digest('hex');

function send(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  return response.status(status).json(body);
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
      // 복원할 메모는 경로의 ID 한 건뿐입니다. 본문에도 ID가 있으면 같아야 하고, 그 밖의 항목은 쓰지 않습니다.
      const fromPath = request.query?.id;
      const fromBody = request.body?.id;
      const id = String(fromPath ?? fromBody ?? '');
      if (!UUID.test(id) || (fromPath !== undefined && fromBody !== undefined && fromBody !== fromPath)) {
        return send(response, 400, { error: 'INVALID_INPUT' });
      }
      const backup = await db.getBackup(id);
      // 사본이 없거나 남의 메모면 없는 것과 똑같이 404로 답합니다.
      if (!backup || backup.owner_id !== who.userId) return send(response, 404, { error: 'NO_BACKUP' });
      const expected = contentHash({ id: backup.memo_id, owner_id: backup.owner_id, title: backup.title, body: backup.body });
      if (backup.memo_id !== id || expected !== backup.content_sha256) {
        console.warn('restore refused', id, 'backup_hash_mismatch');
        return send(response, 409, { error: 'BACKUP_INVALID', message: '사본 검증에 실패해 복원하지 않았습니다.' });
      }
      const current = await db.getRow(id);
      if (current && current.owner_id !== backup.owner_id) {
        console.warn('restore refused', id, 'owner_mismatch');
        return send(response, 409, { error: 'OWNER_MISMATCH', message: '다른 소유자의 메모는 덮어쓰지 않습니다.' });
      }
      const before = current ? contentHash(current) : null;
      if (before === backup.content_sha256) {
        return send(response, 200, { id, restored: false, contentSha256: backup.content_sha256 });
      }
      await db.restoreMemo({ id, owner_id: backup.owner_id, title: backup.title, body: backup.body });
      await db.audit({ action: 'restore', memo_id: id, owner_id: backup.owner_id,
        detail: { existed: Boolean(current), beforeSha256: before, afterSha256: backup.content_sha256 } });
      return send(response, 200, { id, restored: true, contentSha256: backup.content_sha256 });
    } catch (error) {
      console.error('restore failed', error?.code ?? 'unknown');
      return send(response, 502, { error: 'RESTORE_UNAVAILABLE' });
    }
  };
}
