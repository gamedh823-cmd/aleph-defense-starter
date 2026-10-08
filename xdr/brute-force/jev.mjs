// Jev(TypeSafe AI의 판단 모델) 선택 연결입니다. 환경변수 JEV_API_URL(https)·JEV_API_KEY(선택)가 있을 때만 부릅니다.
// 주소와 키는 코드에 적지 않습니다. 응답이 없거나 형식이 틀리면 null을 돌려줍니다.
export async function askJev(summary, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const url = env.JEV_API_URL;
  if (typeof url !== 'string' || !url.startsWith('https://') || typeof fetchImpl !== 'function') return null;
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(env.JEV_API_KEY ? { Authorization: `Bearer ${env.JEV_API_KEY}` } : {}) },
      body: JSON.stringify({ task: 'brute-force-confidence', alert: summary }),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const confidence = (await response.json())?.confidence;
    return typeof confidence === 'number' && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
      ? confidence : null;
  } catch {
    return null;
  }
}
