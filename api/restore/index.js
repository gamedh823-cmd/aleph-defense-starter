// POST /api/restore (10단계): 본문의 id 한 건만 복원합니다. 경로에 ID를 넣는 /api/restore/:id와 같은 처리부를 씁니다.
import { getRestoreApi, notConfigured } from '../../src/notes-runtime.mjs';

export default function handler(request, response) {
  const api = getRestoreApi();
  return api ? api(request, response) : notConfigured(response);
}
