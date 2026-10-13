// GET /api/notices: 반 공지 목록(읽기 전용, 구역 class-notices). 쓰기는 405로 거부합니다.
import { getNotesApi, notConfigured } from '../../src/notes-runtime.mjs';

export default function handler(request, response) {
  const api = getNotesApi();
  return api ? api.notices(request, response) : notConfigured(response);
}
