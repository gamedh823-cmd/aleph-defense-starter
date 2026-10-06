// 3단계 메모 API 처리부. 로그인 검사(verify)와 저장소(db)를 주입받아 단위 시험이 가능합니다.
// 알려진 약점: /:id 경로는 아직 소유자를 검사하지 않습니다. (4단계에서 막습니다.)
import { randomUUID } from 'node:crypto';

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
    return guarded(request, response, async () => {
      const id = String(request.query?.id ?? '');
      if (!UUID.test(id)) return send(response, 404, { error: 'NOT_FOUND' });
      if (method === 'GET') {
        const found = await db.get(id);
        return found ? send(response, 200, found) : send(response, 404, { error: 'NOT_FOUND' });
      }
      if (method === 'PUT') {
        const fields = parseFields(request.body, { partial: true });
        if (!fields) return send(response, 400, { error: 'INVALID_INPUT' });
        const updated = await db.update(id, fields);
        return updated ? send(response, 200, updated) : send(response, 404, { error: 'NOT_FOUND' });
      }
      const removed = await db.remove(id);
      return removed ? send(response, 200, { id }) : send(response, 404, { error: 'NOT_FOUND' });
    });
  }

  return { collection, item };
}
