// 제작 1: 외부 전송 Wazuh 경보에서 시각·출발 주소·계정·규칙 수준·설명만 뽑습니다. 원본 경보는 고치지 않습니다.
// 확인용이라 decide.mjs 는 이 파일을 불러오지 않습니다. 추출 로직은 다른 보너스 모듈과 같습니다.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// 비밀값처럼 보이는 문자열은 출력하지 않고 가립니다.
const SECRET_LIKE = new RegExp([
  String.raw`eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`,
  String.raw`sb_(?:publishable|secret)_[A-Za-z0-9_-]+`,
  String.raw`\bsk-[A-Za-z0-9_-]{16,}`,
  String.raw`-----BEGIN [A-Z ]*PRIVATE KEY-----`,
  String.raw`Bearer\s+[A-Za-z0-9._~+/=-]{8,}`,
  String.raw`(?:password|passwd|token|secret|apikey)\s*[=:]\s*\S+`,
].join('|'), 'giu');

export const redact = (text) => String(text ?? '').replace(SECRET_LIKE, '[가림]');

export function extractLine(alert) {
  return {
    id: String(alert?.id ?? ''),
    timestamp: String(alert?.timestamp ?? ''),
    srcip: String(alert?.data?.srcip ?? ''),
    user: String(alert?.data?.srcuser ?? ''),
    level: Number(alert?.rule?.level ?? 0),
    description: redact(alert?.rule?.description),
  };
}

export async function readAlerts(moduleKey = 'exfiltration', root = ROOT) {
  const fixture = JSON.parse(await readFile(join(root, 'xdr', 'fixtures', `${moduleKey}.json`), 'utf8'));
  if (fixture?.schema !== 'aleph.xdr.fixture.v1' || !Array.isArray(fixture.alerts)) {
    throw new Error('경보 묶음 형식이 아닙니다.');
  }
  return { alerts: fixture.alerts, lines: fixture.alerts.map(extractLine) };
}

const isMain = process.argv[1] && join(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { alerts, lines } = await readAlerts(process.argv[2] ?? 'exfiltration');
  for (const line of lines) console.log(JSON.stringify(line));
  console.error(`경보 ${alerts.length}건 → 뽑은 줄 ${lines.length}줄`);
}
