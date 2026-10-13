import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deploymentIdentity } from './deployment-identity.mjs';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'public', 'data.json');
const config = JSON.parse(await readFile(resolve(root, 'aleph.config.json'), 'utf8'));
if (![5, 6, 7, 8, 9, 10, 11, 12].includes(config.step)) {
  throw new Error('5~12단계 설정과 서버 경유 메모 API를 확인하세요.');
}
await mkdir(resolve(root, 'public'), { recursive: true });
// 12단계: /data.json은 정적 파일 대신 api/data.js가 빈 메모 목록으로 응답하고 서버 요청 기록을 남깁니다.
// 정적 파일이 있으면 Vercel이 rewrites보다 먼저 내보내므로 만들지 않고, 남아 있으면 지웁니다.
await rm(output, { force: true });
console.log('/data.json은 api/data.js가 빈 메모 목록으로 응답합니다(정적 파일 없음).');
if (!process.argv.includes('--local')) {
  const identity = deploymentIdentity(process.env, config);
  await writeFile(resolve(root, 'public', 'aleph.json'),
    `${JSON.stringify(identity, null, 2)}\n`, 'utf8');
  console.log('배포 저장소·커밋·주소를 public/aleph.json에 기록했습니다.');
}
