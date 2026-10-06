// GET /api/notes: 로그인한 사용자의 메모 목록, POST /api/notes: 메모 추가
import { getNotesApi, notConfigured } from '../../src/notes-runtime.mjs';

export default function handler(request, response) {
  const api = getNotesApi();
  return api ? api.collection(request, response) : notConfigured(response);
}
