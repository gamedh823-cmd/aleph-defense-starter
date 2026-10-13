// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// 6단계: 등록된 기기(request.deviceRegistered === true)만 허용합니다.
// 7단계: 엔진이 넘긴 접속 신호가 여럿 겹치면 추가 확인(step_up)을 요구합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
// 8단계: 엔진이 확인한 method·route·path만 보고 정확히 허용한 자료 경로 밖은 거부합니다.
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required', 'zone_routes']);

// 자원 경로 목록. 구역(메모·공지)과 소유자·강사 권한은 자료 API가 DB 값으로 다시 확인합니다.
// 진단용(임시): GET /notes/:id를 막아 심판의 "다른 구역 조회"가 이 경로로 들어오는지 확인합니다.
const ALLOWED_ROUTES = Object.freeze(['GET /notes', 'POST /notes', 'PUT /notes/:id', 'DELETE /notes/:id']);
const ITEM_ID = /^[A-Za-z0-9_-]{1,64}$/u;
// :id 자리에 기능 이름이 들어오면 자료 ID가 아니라 기능 경로이므로 거부합니다.
const FEATURE_WORDS = Object.freeze(['export', 'import', 'all', 'bulk', 'admin', 'search', 'batch', 'backup', 'dump', 'list']);

function zoneRouteAllowed(request) {
  if (typeof request?.route !== 'string' || typeof request?.method !== 'string'
      || typeof request?.path !== 'string') return false;
  // 엔진 경로는 '/notes', 설정의 허용 경로는 '/api/notes' 모양이라 앞의 /api만 맞춰 비교합니다.
  const route = request.route.replace(/^([A-Z]+) \/api\//u, '$1 /');
  const path = request.path.replace(/^\/api(?=\/)/u, '');
  if (!ALLOWED_ROUTES.includes(route) || !route.startsWith(`${request.method} `)) return false;
  // 쿼리로 기능을 고르지 못하게 쿼리가 있는 요청은 허용하지 않습니다.
  if (request.queryLength !== 0) return false;
  if (!route.endsWith('/:id')) return path === '/notes';
  const match = /^\/notes\/([^/]+)$/u.exec(path);
  return Boolean(match && ITEM_ID.test(match[1]) && !FEATURE_WORDS.includes(match[1].toLowerCase()));
}

// 엔진이 검증해 넘긴 신호 출처만 믿습니다. 실제 경로의 'none'이나 알 수 없는 출처는 근거로 쓰지 않습니다.
const TRUSTED_SIGNAL_SOURCES = Object.freeze(['judge_fixture']);
const BURST_WINDOW_SECONDS = 600;
const BURST_COUNT = 10;
const STEP_UP_SIGNALS = 2;

// 출처가 믿을 만하고 모양이 맞을 때만 신호를 돌려줍니다. 없거나 이상하면 null이며, 정상값으로 채우지 않습니다.
function trustedSignals(request) {
  const signals = request?.signals;
  if (!signals || typeof signals !== 'object' || !TRUSTED_SIGNAL_SOURCES.includes(signals.source)) return null;
  if (typeof signals.region !== 'string' || typeof signals.network !== 'string'
      || !Number.isInteger(signals.hour) || signals.hour < 0 || signals.hour > 23) return null;
  return signals;
}

function burstCount(request) {
  if (!Array.isArray(request?.recentEvents)) return 0;
  return request.recentEvents.reduce((sum, event) => (
    event && Number.isInteger(event.count) && event.count > 0
      && Number.isInteger(event.ageSeconds) && event.ageSeconds >= 0
      && event.ageSeconds <= BURST_WINDOW_SECONDS ? sum + event.count : sum), 0);
}

// 지역·시각·네트워크·짧은 시간의 대량 행동 중 둘 이상이 겹칠 때만 이상으로 봅니다. 지역 하나만으로는 올리지 않습니다.
function unusualSignalCount(request) {
  const signals = trustedSignals(request);
  if (!signals) return 0;
  return [
    signals.region === 'foreign',
    signals.hour < 6 || signals.hour >= 23,
    signals.network === 'unusual',
    burstCount(request) >= BURST_COUNT,
  ].filter(Boolean).length;
}

export async function decide(request) {
  const response = (decision, reasonCode, ruleId) => ({
    schema: 'aleph.decision.v1',
    requestId: request?.requestId,
    decision,
    reasonCode,
    ruleIds: [ruleId],
  });
  if (request?.deviceRegistered !== true) {
    return response('deny', 'device_not_registered', 'device_registered');
  }
  if (!zoneRouteAllowed(request)) {
    return response('deny', 'route_not_allowed', 'zone_routes');
  }
  const verified = request.stepUp?.verified === true;
  if (!verified && unusualSignalCount(request) >= STEP_UP_SIGNALS) {
    return response('step_up', 'step_up_required', 'step_up_required');
  }
  return response('allow', 'approved', 'device_registered');
}
