import { sendJson } from './notes.js';
import { withAccessLog } from '../src/access-log.mjs';

// 12단계: 예전 정적 공개 파일 주소(/data.json)를 함수로 받아 빈 메모 목록만 돌려주고, 요청을 서버 요청 기록에 남깁니다.
// 메모는 이 주소로 공개하지 않습니다. vercel.json의 rewrites가 /data.json을 이 함수로 보냅니다.
export function handleData(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return sendJson(response, 405, { error: 'method_not_allowed' });
  }
  return sendJson(response, 200, { notes: [] });
}

export default withAccessLog('/data.json', (request, response) => handleData(request, response));
