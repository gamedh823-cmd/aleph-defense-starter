// GET·PUT·DELETE /api/notes/:id (3단계: 소유자 검사는 아직 없습니다. 4단계에서 막습니다.)
import { getNotesApi, notConfigured } from '../../src/notes-runtime.mjs';

export default function handler(request, response) {
  const api = getNotesApi();
  return api ? api.item(request, response) : notConfigured(response);
}
