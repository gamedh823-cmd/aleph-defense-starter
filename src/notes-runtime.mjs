// 실제 배포에서 메모 API에 로그인 검사와 Supabase를 연결합니다.
// SUPABASE_URL과 서버 전용 SUPABASE_SECRET_KEY는 환경변수에서만 읽고 어디에도 출력하지 않습니다.
import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };
import { createNotesApi } from './notes-api.mjs';
import { createLoginVerifier } from './verify-login.mjs';

const TABLE = 'defense_memos';
const COLUMNS = 'id, title, body';
let cached;

function makeDb(client) {
  return {
    async list(ownerId) {
      const { data, error } = await client.from(TABLE).select(COLUMNS)
        .eq('owner_id', ownerId).order('created_at');
      if (error) throw error;
      return data;
    },
    async insert(row) {
      const { error } = await client.from(TABLE).insert(row);
      if (error?.code === '23505') return 'duplicate';
      if (error) throw error;
      return 'created';
    },
    async get(id, ownerId) {
      const { data, error } = await client.from(TABLE).select(COLUMNS)
        .eq('id', id).eq('owner_id', ownerId).maybeSingle();
      if (error) throw error;
      return data;
    },
    async update(id, ownerId, fields) {
      const { data, error } = await client.from(TABLE).update(fields)
        .eq('id', id).eq('owner_id', ownerId).select(COLUMNS).maybeSingle();
      if (error) throw error;
      return data;
    },
    async remove(id, ownerId) {
      const { data, error } = await client.from(TABLE).delete()
        .eq('id', id).eq('owner_id', ownerId).select('id');
      if (error) throw error;
      return data.length > 0;
    },
  };
}

// 설정이 빠졌거나 틀리면 null을 돌려주고, 호출한 쪽이 503으로 답합니다.
export function getNotesApi() {
  if (cached !== undefined) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  try {
    if (!url || !key) throw new Error('missing_environment');
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const verify = createLoginVerifier({ config, supabaseSecretKey: key });
    cached = createNotesApi({ verify, db: makeDb(client) });
  } catch (error) {
    console.error('notes api not configured', error?.message ?? 'unknown');
    cached = null;
  }
  return cached;
}

export function notConfigured(response) {
  response.setHeader('Cache-Control', 'no-store');
  return response.status(503).json({ error: 'SERVER_NOT_CONFIGURED' });
}
