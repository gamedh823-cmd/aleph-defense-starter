// GET /api/my/notes: 로그인한 사용자 본인의 메모 목록(읽기 전용, 구역 my-notes)
import { getNotesApi, notConfigured } from '../../src/notes-runtime.mjs';

export default function handler(request, response) {
  const api = getNotesApi();
  return api ? api.myNotes(request, response) : notConfigured(response);
}
