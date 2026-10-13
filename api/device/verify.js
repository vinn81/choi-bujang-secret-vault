import { handleDeviceVerify } from '../../src/device-flow.mjs';

// 11단계: POST /api/device/verify — 패스키 서명을 검증하고 서버가 승인한 기기에만 기기 세션을 줍니다.
export default function handler(request, response) {
  return handleDeviceVerify(request, response);
}
