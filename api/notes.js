// 2단계: 가상 메모를 서버에서만 읽어 돌려줍니다.
// SUPABASE_URL과 서버 전용 SUPABASE_SECRET_KEY는 Vercel 환경변수에서만 읽습니다.
// 알려진 약점: 아직 로그인 검사가 없어 이 주소는 누구나 부를 수 있습니다. (3단계에서 막습니다.)
import { createClient } from '@supabase/supabase-js';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return response.status(503).json({ error: 'SERVER_NOT_CONFIGURED' });

  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.from('defense_notes').select('title, content').order('id');
  if (error) {
    // 키나 응답 본문은 기록하지 않고 오류 코드만 남깁니다.
    console.error('notes query failed', error.code ?? 'unknown');
    return response.status(502).json({ error: 'NOTES_UNAVAILABLE' });
  }
  return response.status(200).json({ notes: data });
}
