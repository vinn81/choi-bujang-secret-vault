import { handleDeviceRegister } from '../../src/device-flow.mjs';

// 11단계: POST /api/device/register — 이 기기를 승인 대기로 등록합니다(본문 {} → 옵션, { response } → 등록).
export default function handler(request, response) {
  return handleDeviceRegister(request, response);
}
