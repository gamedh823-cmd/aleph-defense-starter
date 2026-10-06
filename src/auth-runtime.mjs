// 실제 배포에서 Supabase Auth에 연결합니다. 공개 키(SUPABASE_PUBLISHABLE_KEY)와 SUPABASE_URL은
// 서버 함수 환경변수에서만 읽고, 저장소·화면 코드·응답에는 넣지 않습니다.
import { createClient } from '@supabase/supabase-js';
import { createAuthApi } from './auth-api.mjs';

let cached;

function toSession(session, email) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    email: session.user?.email ?? email ?? '',
  };
}

export function getAuthApi() {
  if (cached !== undefined) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    console.error('auth api not configured');
    cached = null;
    return cached;
  }
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  cached = createAuthApi({
    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error || !data.session) return { message: error?.message ?? '로그인하지 못했습니다.' };
      return { session: toSession(data.session, email) };
    },
    async refresh(refreshToken) {
      const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session) return {};
      return { session: toSession(data.session) };
    },
  });
  return cached;
}

export function authNotConfigured(response) {
  response.setHeader('Cache-Control', 'no-store');
  return response.status(503).json({ error: 'SERVER_NOT_CONFIGURED', message: '로그인 서버 설정이 아직 없습니다.' });
}
