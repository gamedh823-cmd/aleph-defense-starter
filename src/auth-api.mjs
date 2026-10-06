// 5단계: 로그인과 토큰 갱신을 서버 함수로 모읍니다. 브라우저에는 Supabase 키가 없습니다.
// signIn·refresh는 주입받아 단위 시험이 가능합니다. 이메일·비밀번호·토큰은 로그에 남기지 않습니다.

function send(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  return response.status(status).json(body);
}

const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;

export function createAuthApi({ signIn, refresh }) {
  async function handle(request, response, run) {
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
    }
    try {
      return await run(request.body ?? {});
    } catch {
      return send(response, 502, { error: 'AUTH_UNAVAILABLE', message: '로그인 서버에 연결하지 못했습니다.' });
    }
  }

  const login = (request, response) => handle(request, response, async ({ email, password }) => {
    if (!text(email, 254) || !text(password, 256)) {
      return send(response, 400, { error: 'INVALID_INPUT', message: '이메일과 비밀번호를 입력해 주세요.' });
    }
    const result = await signIn(email, password);
    return result.session
      ? send(response, 200, result.session)
      : send(response, 401, { error: 'LOGIN_FAILED', message: result.message });
  });

  const refreshSession = (request, response) => handle(request, response, async ({ refresh_token: token }) => {
    if (!text(token, 2048)) return send(response, 400, { error: 'INVALID_INPUT' });
    const result = await refresh(token);
    return result.session
      ? send(response, 200, result.session)
      : send(response, 401, { error: 'LOGIN_REQUIRED', message: '다시 로그인해 주세요.' });
  });

  return { login, refresh: refreshSession };
}
