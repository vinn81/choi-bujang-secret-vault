import { comparePolicy, git, loadVerifiedPolicy, printPlan } from './policy-lib.mjs';

// 10단계: 침해 전에 검증한 정책 사본과 현재 작업 폴더의 정책 차이만 보여 줍니다.
// 읽기만 합니다. 사본이 없거나 지문 검증에 실패하면 차이를 보여 주지 않고 중단합니다.
try {
  const policy = loadVerifiedPolicy();
  const changed = printPlan(policy, comparePolicy(policy));
  if (process.argv.includes('--patch') && changed.length) {
    process.stdout.write('\n--- 줄 단위 차이 ---\n');
    process.stdout.write(git('diff', policy.manifest.verifiedCommit, '--', ...changed.map(item => item.path)).toString());
  } else if (changed.length) {
    process.stdout.write('줄 단위 차이는 npm run policy:diff -- --patch 로 봅니다.\n');
  }
  process.stdout.write('이 명령은 차이만 보여 주며 아무것도 복원하거나 고치지 않았습니다. 학습 DB 권한은 포함하지 않습니다.\n');
} catch (error) {
  process.stderr.write(`정책 비교 중단: ${error.message}\n`);
  process.exitCode = 1;
}
