import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// 10단계: 검증된 정책 사본(policy/verified-policy.json)을 검증하고 현재 정책과의 차이를 계산하는 공통 함수입니다.
// 이 모듈은 읽기만 합니다. 학습 DB·배포 같은 실제 운영 정책에는 접속하지 않습니다.
export const root = resolve(import.meta.dirname, '..');
export const MANIFEST = 'policy/verified-policy.json';
const SHA = /^[0-9a-f]{40}$/u;
const HASH = /^[0-9a-f]{64}$/u;
const KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/u;

export const sha256 = data => createHash('sha256').update(data).digest('hex');
export const git = (...args) => execFileSync('git', ['-C', root, ...args], {
  encoding: 'buffer', timeout: 10000, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
  stdio: ['ignore', 'pipe', 'ignore'],
});
const stop = message => { throw new Error(message); };

// JSON 설정은 정책 항목(policyKeys)만 골라 비교합니다. 나머지 설정은 비교·복원 대상이 아닙니다.
const policySubset = (json, keys) => JSON.stringify(Object.fromEntries(keys.map(key => [key, json[key] ?? null])));

// 사본이 없거나 형식·커밋·지문 검증에 실패하면 예외로 중단합니다.
export function loadVerifiedPolicy() {
  const manifestPath = join(root, MANIFEST);
  if (!existsSync(manifestPath)) stop(`검증된 정책 사본 목록(${MANIFEST})이 없습니다.`);
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { stop(`${MANIFEST}를 읽을 수 없습니다.`); }
  const entries = Object.entries(manifest?.files ?? {}).map(([path, value]) => ({
    path,
    hash: typeof value === 'string' ? value : value?.sha256,
    policyKeys: typeof value === 'string' ? null : value?.policyKeys,
  }));
  if (manifest?.schema !== 'aleph.policy.verified.v1' || !SHA.test(manifest.verifiedCommit ?? '')
      || !entries.length || entries.some(({ path, hash, policyKeys }) => !HASH.test(hash ?? '')
        || path.includes('..') || path.startsWith('/')
        || (policyKeys !== null && (!Array.isArray(policyKeys) || !policyKeys.length
          || !policyKeys.every(key => KEY.test(key)) || !path.endsWith('.json'))))) {
    stop(`${MANIFEST}의 형식이 맞지 않습니다.`);
  }
  try { git('cat-file', '-e', `${manifest.verifiedCommit}^{commit}`); } catch {
    stop(`사본 커밋 ${manifest.verifiedCommit.slice(0, 12)}을 이 저장소에서 찾을 수 없습니다.`);
  }
  for (const entry of entries) {
    try { entry.baseline = git('show', `${manifest.verifiedCommit}:${entry.path}`); } catch {
      stop(`사본 커밋에 ${entry.path}가 없습니다.`);
    }
    if (sha256(entry.baseline) !== entry.hash) stop(`사본 검증 실패: ${entry.path}의 지문이 목록과 다릅니다.`);
  }
  return { manifest, entries };
}

// 파일마다 'same' | 'changed' | 'missing'과 복원했을 때 쓸 내용을 계산합니다.
export function comparePolicy({ entries }) {
  return entries.map(entry => {
    const currentPath = join(root, entry.path);
    if (!existsSync(currentPath)) {
      return { ...entry, status: 'missing', currentHash: null, restored: entry.baseline };
    }
    const current = readFileSync(currentPath);
    if (entry.policyKeys) {
      let currentJson;
      try { currentJson = JSON.parse(current.toString('utf8')); } catch { currentJson = null; }
      const baselineJson = JSON.parse(entry.baseline.toString('utf8'));
      if (currentJson && policySubset(currentJson, entry.policyKeys) === policySubset(baselineJson, entry.policyKeys)) {
        return { ...entry, status: 'same', currentHash: sha256(current), restored: null };
      }
      // 정책 항목만 사본 값으로 바꾸고 단계·주소 같은 다른 설정은 현재 값을 유지합니다.
      const merged = { ...(currentJson ?? baselineJson) };
      for (const key of entry.policyKeys) merged[key] = baselineJson[key];
      const changedKeys = entry.policyKeys.filter(key =>
        JSON.stringify(currentJson?.[key] ?? null) !== JSON.stringify(baselineJson[key] ?? null));
      return { ...entry, status: 'changed', currentHash: sha256(current), changedKeys,
        restored: Buffer.from(`${JSON.stringify(merged, null, 2)}\n`, 'utf8') };
    }
    if (sha256(current) === entry.hash) return { ...entry, status: 'same', currentHash: entry.hash, restored: null };
    return { ...entry, status: 'changed', currentHash: sha256(current), restored: entry.baseline };
  });
}

// 바뀔 항목 묶음의 확인 번호입니다. 미리보기 뒤 파일이 또 바뀌면 번호가 달라집니다.
export const changeSetId = (manifest, results) => sha256(JSON.stringify([manifest.verifiedCommit,
  ...results.filter(item => item.status !== 'same').map(item => [item.path, item.currentHash])])).slice(0, 12);

export function printPlan({ manifest, entries }, results) {
  const lines = [
    `복원할 버전: ${manifest.label ?? '검증된 사본'} · 커밋 ${manifest.verifiedCommit.slice(0, 12)} · ${manifest.verifiedAt ?? '시각 미기록'}`,
    `사본 검증: 통과 (${entries.length}개 파일 지문 일치)`, '', '변경 범위:',
  ];
  for (const item of results) {
    if (item.status === 'same') lines.push(`  같음    ${item.path}`);
    else if (item.status === 'missing') lines.push(`  삭제됨  ${item.path}`);
    else if (item.policyKeys) lines.push(`  변경됨  ${item.path} (정책 항목: ${item.changedKeys.join(', ')})`);
    else {
      const [added = '?', removed = '?'] = git('diff', '--numstat', manifest.verifiedCommit, '--', item.path)
        .toString().trim().split(/\s+/u);
      lines.push(`  변경됨  ${item.path} (+${added} / -${removed}줄)`);
    }
  }
  const changed = results.filter(item => item.status !== 'same');
  lines.push('', `요약: ${changed.length ? `${changed.length}개 파일이 사본과 다릅니다.` : '사본과 차이가 없습니다.'}`);
  process.stdout.write(`${lines.join('\n')}\n`);
  return changed;
}
