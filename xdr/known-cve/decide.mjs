// 제작 3: decide(alert) 하나를 내보냅니다. 반환은 { action: 'block' | 'alert' | 'record', confidence, reason } 입니다.
// 확신도 0.85 이상은 block, 0.5 이상은 alert, 그 아래는 record 입니다.
// 이 파일은 다른 파일을 불러오지 않고, 파일을 읽거나 쓰지 않고, 바깥에 묻지 않고 혼자 계산합니다.
// 패턴 이름은 xdr/known-cve/patterns.json 과 같습니다. 원격 조회 구문은 문서용 표기를 찾기만 하고 만들어 내지 않습니다.

const NAME_HEADER = '머리글 속 원격 조회 구문';
const NAME_URL = '주소 인자 속 원격 조회 구문';
const NAME_OBFUSCATED = '치환으로 가린 원격 조회 구문';
const NAME_SCANNER = '알려진 취약점 점검 도구 흔적';
const NAME_WEAK = '낮은 수준의 알려진 취약점 신호';

const LOOKUP = /\$\{\s*jndi\s*:\s*(?:ldaps?|rmi|dns|iiop|corba|nis|https?)\s*:\/\//iu;
const SCANNER = /\b(?:nuclei|log4j-?scan|log4shell|zgrab|masscan|interactsh)\b/iu;
const HEADER_KEYS = ['useragent', 'user_agent', 'user-agent', 'referer', 'referrer', 'x-api-version', 'x-forwarded-for'];
const URL_KEYS = ['url', 'uri', 'path', 'args', 'query', 'body'];

const toAction = (confidence) => (confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record');

// ${lower:j}, ${upper:J}, ${::-j} 같은 치환을 풀어 가려진 조회 구문을 드러냅니다.
function unmask(text) {
  let current = text;
  for (let i = 0; i < 6; i += 1) {
    const next = current
      .replace(/\$\{\s*(?:lower|upper)\s*:\s*([^${}]*)\}/giu, '$1')
      .replace(/\$\{[^${}]*?:-([^${}]*)\}/gu, '$1');
    if (next === current) break;
    current = next;
  }
  return current;
}

function textOf(value, depth = 0) {
  if (value == null || depth > 4) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([key]) => !/password|passwd|token|secret|authorization|api[_-]?key/iu.test(key))
      .map(([, item]) => textOf(item, depth + 1))
      .join('\n');
  }
  return '';
}

function pick(data, keys) {
  const out = [];
  for (const [key, value] of Object.entries(data ?? {})) {
    if (keys.includes(key.toLowerCase())) out.push(textOf(value));
    else if (typeof value === 'object' && value !== null && /header/iu.test(key)) out.push(textOf(value));
  }
  return out.join('\n');
}

function facts(alert) {
  const data = alert?.data && typeof alert.data === 'object' ? alert.data : {};
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre.map(String) : [];
  const headers = pick(data, HEADER_KEYS) + '\n' + textOf(Object.entries(data).filter(([k]) => /header/iu.test(k)).map(([, v]) => v));
  const urls = pick(data, URL_KEYS);
  return {
    level: Number(alert?.rule?.level ?? 0) || 0,
    count: Number(data.count ?? 0) || 0,
    t1190: mitre.some((id) => id === 'T1190' || id.startsWith('T1190.')),
    headers,
    urls,
    fullLog: typeof alert?.full_log === 'string' ? alert.full_log : '',
  };
}

export function decide(alert) {
  const f = facts(alert);
  const names = [];
  let obfuscated = false;

  const inHeader = LOOKUP.test(f.headers);
  const inUrl = LOOKUP.test(f.urls) || LOOKUP.test(f.fullLog);
  if (inHeader) names.push(NAME_HEADER);
  if (inUrl) names.push(NAME_URL);
  if (!inHeader && !inUrl) {
    const hidden = LOOKUP.test(unmask(`${f.headers}\n${f.urls}\n${f.fullLog}`));
    if (hidden) {
      obfuscated = true;
      names.push(NAME_OBFUSCATED);
    }
  }

  // 명확한 공격: 원격 조회 구문이 실제로 들어 있습니다. 수준·반복·여러 위치가 겹칠수록 확신도가 올라갑니다.
  if (names.length > 0) {
    let confidence = obfuscated ? 0.88 : 0.9;
    if (f.level >= 10) confidence += 0.03;
    if (f.count >= 4) confidence += 0.03;
    if (names.length > 1) confidence += 0.03;
    confidence = Math.min(0.99, confidence);
    return { action: 'block', confidence: Number(confidence.toFixed(2)), reason: `패턴: ${names.join(', ')}` };
  }

  // 애매한 시도: 점검 도구 이름이나, T1190 표시가 있는 낮은 수준 신호입니다. 막지 않고 알립니다.
  if (SCANNER.test(f.headers) || SCANNER.test(f.urls)) {
    return { action: 'alert', confidence: 0.6, reason: `패턴: ${NAME_SCANNER}` };
  }
  if (f.t1190 && f.level >= 5) {
    return { action: 'alert', confidence: 0.55, reason: `패턴: ${NAME_WEAK}` };
  }

  return { action: 'record', confidence: 0.05, reason: '근거 패턴 없음: 원격 조회 구문이 없는 정상 요청' };
}
