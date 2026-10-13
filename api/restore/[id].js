// POST /api/restore/:id (10단계): 검증한 사본에서 로그인한 소유자의 메모 한 건만 복원합니다.
import { getRestoreApi, notConfigured } from '../../src/notes-runtime.mjs';

export default function handler(request, response) {
  const api = getRestoreApi();
  return api ? api(request, response) : notConfigured(response);
}
