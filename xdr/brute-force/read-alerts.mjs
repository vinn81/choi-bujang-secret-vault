import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const FIXTURE_URL = new URL('../fixtures/brute-force.json', import.meta.url);

export async function readAlerts() {
  const fixture = JSON.parse(await readFile(FIXTURE_URL, 'utf8'));

  if (!Array.isArray(fixture.alerts)) {
    throw new TypeError('invalid_brute_force_alerts');
  }

  const rows = fixture.alerts.map((alert) => ({
    timestamp: alert.timestamp,
    srcip: alert.data?.srcip,
    srcuser: alert.data?.srcuser,
    level: alert.rule?.level,
    description: alert.rule?.description,
  }));

  if (rows.length !== fixture.alerts.length) {
    throw new Error('alert_row_count_mismatch');
  }

  return rows;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  for (const row of await readAlerts()) {
    process.stdout.write(`${JSON.stringify(row)}\n`);
  }
}
