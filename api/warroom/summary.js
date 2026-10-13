// GET /api/warroom/summary (12단계): 탈환 작전실 화면이 읽는 본인 기록 요약(숫자만, 메모 본문 없음)
import { getWarRoomApi, notConfigured } from '../../src/notes-runtime.mjs';

export default function handler(request, response) {
  const api = getWarRoomApi();
  return api ? api(request, response) : notConfigured(response);
}
