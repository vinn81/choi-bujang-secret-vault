// 확인용 읽기 모듈입니다. decide.mjs 는 이 파일을 불러오지 않습니다.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const FIXTURE_URL = new URL('../fixtures/web-injection.json', import.meta.url);

// 토큰·키·비밀번호처럼 보이는 값은 출력하지 않고 가립니다.
const SECRET_LIKE = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/gu,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/giu,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/gu,
  /\b(?:sb_secret_|sk-|ghp_|github_pat_|AKIA)[A-Za-z0-9_-]{12,}/gu,
  /\b(?:password|passwd|pwd|token|secret|api[_-]?key|access[_-]?key)\s*[=:]\s*[^\s&;,]+/giu,
];

function hideSecrets(value) {
  if (typeof value !== 'string') return value ?? null;
  return SECRET_LIKE.reduce((text, pattern) => text.replace(pattern, '[가림]'), value);
}

export async function readAlerts() {
  const fixture = JSON.parse(await readFile(FIXTURE_URL, 'utf8'));

  if (!Array.isArray(fixture.alerts)) {
    throw new TypeError('invalid_web_injection_alerts');
  }

  const rows = fixture.alerts.map((alert) => ({
    timestamp: alert?.timestamp ?? null,
    srcip: alert?.data?.srcip ?? null,
    srcuser: hideSecrets(alert?.data?.srcuser),
    level: alert?.rule?.level ?? null,
    description: hideSecrets(alert?.rule?.description),
  }));

  if (rows.length !== fixture.alerts.length) {
    throw new Error('alert_row_count_mismatch');
  }

  return rows;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const rows = await readAlerts();
  for (const row of rows) {
    process.stdout.write(`${JSON.stringify(row)}\n`);
  }
  process.stderr.write(`경보 ${rows.length}건을 읽었습니다.\n`);
}
