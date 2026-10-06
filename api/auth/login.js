// POST /api/auth/login: 이메일·비밀번호 로그인을 서버가 대신 합니다.
import { authNotConfigured, getAuthApi } from '../../src/auth-runtime.mjs';

export default function handler(request, response) {
  const api = getAuthApi();
  return api ? api.login(request, response) : authNotConfigured(response);
}
