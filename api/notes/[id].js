// GET·PUT·DELETE /api/notes/:id (4단계: 본인 메모만 허용합니다.)
import { getNotesApi, notConfigured } from '../../src/notes-runtime.mjs';

export default function handler(request, response) {
  const api = getNotesApi();
  return api ? api.item(request, response) : notConfigured(response);
}
