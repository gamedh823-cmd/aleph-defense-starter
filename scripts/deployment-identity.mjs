const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u;
const REPO = /^[A-Za-z0-9._-]{1,100}$/u;
const SHA = /^[a-f0-9]{40}$/iu;
const HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/iu;

export function deploymentIdentity(env, config) {
  const owner = env.VERCEL_GIT_REPO_OWNER;
  const repo = env.VERCEL_GIT_REPO_SLUG;
  const commit = env.VERCEL_GIT_COMMIT_SHA;
  const host = env.VERCEL_URL;
  if (env.VERCEL_GIT_PROVIDER !== 'github' || !OWNER.test(owner || '')
      || !REPO.test(repo || '') || repo === '.' || repo === '..'
      || repo.toLowerCase().endsWith('.git') || !SHA.test(commit || '')
      || !HOST.test(host || '') || !Number.isInteger(config?.step) || config.step < 1 || config.step > 12
      || typeof config.judgeIssuer !== 'string'
      || !/^https:\/\/[a-z0-9-]+\.up\.railway\.app\/defense\/judge$/iu.test(config.judgeIssuer)
      || typeof config.sampleMarker !== 'string'
      || !/^[A-Z0-9_]{1,80}$/u.test(config.sampleMarker)) {
    throw new Error('배포 식별 정보를 확인할 수 없습니다. Vercel 시스템 환경변수와 1단계 시작 틀을 확인하세요.');
  }
  // 8단계부터는 구역이 붙은 객체 경로({service, method, pathPattern, zone})도 공개합니다.
  const text = value => typeof value === 'string' && value.length > 0 && value.length <= 120;
  const routeOk = route => text(route) || (route && typeof route === 'object' && !Array.isArray(route)
    && Object.keys(route).sort().join(',') === 'method,pathPattern,service,zone'
    && text(route.service) && text(route.method) && text(route.pathPattern) && text(route.zone));
  const allowedRoutes = Array.isArray(config.allowedRoutes) && config.allowedRoutes.every(routeOk)
    ? config.allowedRoutes : [];
  // 쿼리·비밀값 없는 HTTPS 원본 자료 경로만 공개합니다.
  let originalApiUrl;
  try {
    const url = new URL(config.originalApiUrl);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash) {
      originalApiUrl = url.href;
    }
  } catch { /* 5단계 이전에는 없는 값입니다. */ }
  // 10단계: 복구 경로 한 건({service, method, pathPattern})만 공개합니다. 모양이 다르면 공개하지 않습니다.
  const restore = config.restoreRoute;
  const restoreRoute = restore && typeof restore === 'object' && !Array.isArray(restore)
    && ['method,pathPattern,service', 'method,pathPattern,service,zone'].includes(Object.keys(restore).sort().join(','))
    && restore.method === 'POST' && text(restore.service) && /^\/api\/[A-Za-z0-9/:_-]{1,100}$/u.test(restore.pathPattern)
    ? { service: restore.service, method: restore.method, pathPattern: restore.pathPattern,
      path: restore.pathPattern, ...(text(restore.zone) ? { zone: restore.zone } : {}) } : undefined;
  return {
    schema: 'aleph.defense.deployment.v1',
    step: config.step,
    repoUrl: `https://github.com/${owner.toLowerCase()}/${repo.toLowerCase()}`,
    commit: commit.toLowerCase(),
    publicAppUrl: `https://${host.toLowerCase()}`,
    judgeIssuer: config.judgeIssuer,
    sampleMarker: config.sampleMarker,
    ...(allowedRoutes.length ? { allowedRoutes } : {}),
    ...(originalApiUrl ? { originalApiUrl } : {}),
    ...(restoreRoute ? { restoreRoute } : {}),
  };
}
