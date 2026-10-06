import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deploymentIdentity } from './deployment-identity.mjs';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'public', 'data.json');
const config = JSON.parse(await readFile(resolve(root, 'aleph.config.json'), 'utf8'));
if (config.step !== 4) {
  throw new Error('4단계 설정과 메모 소유권 API를 확인하세요.');
}
await mkdir(resolve(root, 'public'), { recursive: true });
await writeFile(output, `${JSON.stringify({
  notes: [],
}, null, 2)}\n`, 'utf8');
console.log('공개 public/data.json을 빈 메모 목록으로 유지했습니다.');
if (!process.argv.includes('--local')) {
  const identity = deploymentIdentity(process.env, config);
  await writeFile(resolve(root, 'public', 'aleph.json'),
    `${JSON.stringify(identity, null, 2)}\n`, 'utf8');
  console.log('배포 저장소·커밋·주소를 public/aleph.json에 기록했습니다.');
}
