// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// 6단계: 등록된 기기(request.deviceRegistered === true)만 허용합니다.
// 7단계: 엔진이 넘긴 접속 신호가 여럿 겹치면 추가 확인(step_up)을 요구합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required']);

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
  const verified = request.stepUp?.verified === true;
  if (!verified && unusualSignalCount(request) >= STEP_UP_SIGNALS) {
    return response('step_up', 'step_up_required', 'step_up_required');
  }
  return response('allow', 'approved', 'device_registered');
}
