// POST /api/device/request (11단계): 기기 승인 요청 기록만 만듭니다. 승인은 서버 운영자가 정합니다.
import { getDeviceApi, notConfigured } from '../../src/notes-runtime.mjs';

export default function handler(request, response) {
  const api = getDeviceApi();
  return api ? api.requestApproval(request, response) : notConfigured(response);
}
