// POST /api/auth/refresh: 만료가 가까운 로그인 토큰을 서버가 갱신합니다.
import { authNotConfigured, getAuthApi } from '../../src/auth-runtime.mjs';

export default function handler(request, response) {
  const api = getAuthApi();
  return api ? api.refresh(request, response) : authNotConfigured(response);
}
