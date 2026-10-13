// GET /api/device/status (11단계): 로그인한 사용자의 기기 승인 상태(approved·pending·none)
import { getDeviceApi, notConfigured } from '../../src/notes-runtime.mjs';

export default function handler(request, response) {
  const api = getDeviceApi();
  return api ? api.status(request, response) : notConfigured(response);
}
