import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { changeSetId, comparePolicy, loadVerifiedPolicy, printPlan, root, sha256 } from './policy-lib.mjs';

// 10단계: 검증된 정책 사본으로 시험 정책(작업 폴더의 정책 파일)만 되돌립니다.
// 1) 인자 없이 실행하면 바뀔 항목과 확인 번호만 보여 주고 아무것도 바꾸지 않습니다.
// 2) --apply --confirm=<확인 번호>로 다시 실행해야 되돌립니다. 그사이 파일이 바뀌면 번호가 달라 중단합니다.
// 사본 목록에 없는 파일(다른 서비스 규칙)과 감사 이력은 건드리지 않고, 복원 기록은 감사 로그 끝에 덧붙이기만 합니다.
// 학습 DB·배포 같은 실제 운영 정책에는 접속하지 않습니다.
const AUDIT_LOG = 'policy/restore-audit.log';
const apply = process.argv.includes('--apply');
const confirm = process.argv.find(arg => arg.startsWith('--confirm='))?.slice('--confirm='.length);

try {
  const policy = loadVerifiedPolicy();
  const results = comparePolicy(policy);
  const changed = printPlan(policy, results);
  if (!changed.length) {
    process.stdout.write('되돌릴 항목이 없습니다. 아무것도 바꾸지 않았습니다.\n');
  } else {
    const id = changeSetId(policy.manifest, results);
    if (!apply) {
      process.stdout.write(`\n확인 번호: ${id}\n위 항목을 사본으로 되돌리려면 다음을 실행합니다.\n`
        + `  npm run policy:restore -- --apply --confirm=${id}\n아직 아무것도 바꾸지 않았습니다.\n`);
    } else if (confirm !== id) {
      throw new Error(`확인 번호가 맞지 않습니다(현재 ${id}). 미리보기를 다시 보고 실행해 주세요.`);
    } else {
      for (const item of changed) {
        const target = join(root, item.path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, item.restored);
      }
      // 감사 이력: 내용·비밀값 없이 파일 이름과 지문만 덧붙입니다. 기존 줄은 지우거나 고치지 않습니다.
      appendFileSync(join(root, AUDIT_LOG), `${JSON.stringify({
        at: new Date().toISOString(), action: 'policy_restore', changeSet: id,
        verifiedCommit: policy.manifest.verifiedCommit,
        files: changed.map(item => ({ path: item.path, status: item.status,
          before: item.currentHash, after: sha256(item.restored), keys: item.changedKeys ?? null })),
      })}\n`, 'utf8');
      process.stdout.write(`\n${changed.length}개 파일을 사본으로 되돌렸고 ${AUDIT_LOG}에 기록을 덧붙였습니다.\n`
        + '다음으로 npm run policy:diff 와 1~9단계 시험을 다시 실행해 확인합니다.\n');
    }
  }
} catch (error) {
  process.stderr.write(`정책 복원 중단: ${error.message}\n`);
  process.exitCode = 1;
}
