// 3단계 메모 API 처리부. 로그인 검사(verify)와 저장소(db)를 주입받아 단위 시험이 가능합니다.
// 4단계: 모든 읽기·수정·삭제는 서버가 확인한 사용자 ID와 DB의 owner_id가 같을 때만 허용합니다.
// 남의 메모는 '없는 메모'와 똑같이 404로 답해 존재 여부도 알려 주지 않습니다.
import { randomUUID } from 'node:crypto';
import { authorizeNote, resourceId } from './zones.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function send(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  return response.status(status).json(body);
}

function parseFields(raw, { partial }) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  if (raw.title !== undefined || !partial) {
    if (typeof raw.title !== 'string') return null;
    const title = raw.title.trim();
    if (!title || title.length > 200) return null;
    out.title = title;
  }
  if (raw.body !== undefined) {
    if (typeof raw.body !== 'string' || raw.body.length > 5000) return null;
    out.body = raw.body;
  } else if (!partial) {
    out.body = '';
  }
  if (partial && !Object.keys(out).length) return null;
  return out;
}

export function createNotesApi({ verify, db }) {
  async function guard(request, response) {
    const who = await verify(request.headers?.authorization);
    if (!who) {
      send(response, 401, { error: 'LOGIN_REQUIRED', message: '로그인이 필요합니다.' });
      return null;
    }
    return who;
  }

  async function guarded(request, response, run) {
    try {
      const who = await guard(request, response);
      if (!who) return undefined;
      return await run(who);
    } catch (error) {
      console.error('notes api failed', error?.code ?? 'unknown');
      return send(response, 502, { error: 'NOTES_UNAVAILABLE' });
    }
  }

  async function collection(request, response) {
    const method = request.method;
    if (method !== 'GET' && method !== 'POST') {
      response.setHeader('Allow', 'GET, POST');
      return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
    }
    return guarded(request, response, async (who) => {
      if (method === 'GET') return send(response, 200, await db.list(who.userId));
      const fields = parseFields(request.body, { partial: false });
      const id = request.body?.id ?? randomUUID();
      if (!fields || typeof id !== 'string' || !UUID.test(id)) {
        return send(response, 400, { error: 'INVALID_INPUT' });
      }
      const created = await db.insert({ id, ...fields, owner_id: who.userId });
      if (created === 'duplicate') return send(response, 409, { error: 'ALREADY_EXISTS' });
      return send(response, 201, { id });
    });
  }

  async function item(request, response) {
    const method = request.method;
    if (!['GET', 'PUT', 'DELETE'].includes(method)) {
      response.setHeader('Allow', 'GET, PUT, DELETE');
      return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
    }
    return guarded(request, response, async (who) => {
      const id = String(request.query?.id ?? '');
      if (!UUID.test(id)) return send(response, 404, { error: 'NOT_FOUND' });
      // 8단계: DB에 저장된 구역·소유자·강사 권한과 매 요청마다 대조합니다. 거부 사유는 코드로만 남깁니다.
      const row = await db.getRow(id);
      const action = method === 'GET' ? 'read' : method === 'PUT' ? 'update' : 'delete';
      const instructor = row?.zone === 'notice' && action === 'update'
        ? await db.isInstructor(who.userId) : false;
      const verdict = authorizeNote({ row, userId: who.userId, instructor, action });
      if (!verdict.allow) {
        console.warn('zone denied', resourceId(row?.zone ?? 'unknown', id), action, verdict.reason);
        return verdict.status === 403
          ? send(response, 403, { error: 'FORBIDDEN_ZONE', message: '이 자료는 고칠 수 없는 구역입니다.' })
          : send(response, 404, { error: 'NOT_FOUND' });
      }
      if (method === 'GET') return send(response, 200, { id: row.id, title: row.title, body: row.body });
      if (method === 'PUT') {
        // 소유자를 바꾸려는 요청은 거부합니다. 본문의 owner_id·zone·role은 어떤 경우에도 저장하지 않습니다.
        const claimed = request.body?.owner_id ?? request.body?.ownerId;
        if (claimed !== undefined && claimed !== row.owner_id) {
          return send(response, 403, { error: 'OWNER_CHANGE_FORBIDDEN', message: '소유자는 바꿀 수 없습니다.' });
        }
        const fields = parseFields(request.body, { partial: true });
        if (!fields) return send(response, 400, { error: 'INVALID_INPUT' });
        const updated = row.zone === 'notice'
          ? await db.updateNotice(id, fields) : await db.update(id, who.userId, fields);
        return updated ? send(response, 200, updated) : send(response, 404, { error: 'NOT_FOUND' });
      }
      const removed = await db.remove(id, who.userId);
      return removed ? send(response, 200, { id }) : send(response, 404, { error: 'NOT_FOUND' });
    });
  }

  // 8단계: 선언한 읽기 전용 경로. 쓰기 요청은 405이고, 로그인한 사용자의 본인 메모와 반 공지만 돌려줍니다.
  async function readOnly(request, response, read) {
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
    }
    return guarded(request, response, async (who) => send(response, 200, await read(who)));
  }
  const myNotes = (request, response) => readOnly(request, response, (who) => db.list(who.userId));
  const notices = (request, response) => readOnly(request, response, () => db.listNotices());

  return { collection, item, myNotes, notices };
}
