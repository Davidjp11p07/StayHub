import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import jwt from '../apps/reports-service/node_modules/jsonwebtoken/index.js';
const owner = process.env.REPORTS_DEMO_OWNER_ID ?? '11111111-1111-4111-8111-111111111111';
const key = readFileSync('.artifacts/reports-demo/private.pem', 'utf8');
const token = (role = 'OWNER') => jwt.sign({ role }, key, { algorithm: 'RS256', keyid: 'reports-demo', issuer: 'stayhub-reports-demo', audience: 'stayhub-reports-access', subject: owner, expiresIn: 300 });
const url = 'http://127.0.0.1:3011';
const range = '?from=2026-11-01&to=2026-11-11';
async function get(path, role = 'OWNER') { return fetch(url + path, { headers: { authorization: 'Bearer ' + token(role) }, signal: AbortSignal.timeout(20000) }); }
assert.equal((await fetch(url + '/health/ready')).status, 200);
assert.equal((await fetch(url + '/reports/owner/' + owner + range)).status, 401);
assert.equal((await get('/reports/owner/22222222-2222-4222-8222-222222222222' + range)).status, 403);
assert.equal((await get('/reports/revenue' + range, 'GUEST')).status, 403);
assert.equal((await get('/reports/owner/' + owner + range, 'ADMIN')).status, 200);
for (const path of ['/reports/owner/' + owner, '/reports/occupancy', '/reports/revenue']) {
  const response = await get(path + range);
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const report = await response.json();
  assert.equal(report.source, 'DEMO'); assert.equal(report.metrics.reservations.total, 2); assert.equal(report.metrics.occupancy.rate, 40);
  assert.deepEqual(report.metrics.revenue, [{ currency: 'COP', chargedMinor: '4000000', refundedMinor: '1000000', netMinor: '3000000' }, { currency: 'USD', chargedMinor: '1000', refundedMinor: '0', netMinor: '1000' }]);
}
const snapshot = spawnSync('docker', ['compose', '-p', 'stayhub-reports-demo', '-f', 'docker-compose.reports.yml', 'exec', '-T', 'reports-db', 'psql', '-U', 'stayhub_reports', '-d', 'reports_db', '-Atc', 'SELECT count(*) FROM "ReportSnapshot"'], { encoding: 'utf8' });
assert.equal(snapshot.status, 0); assert.ok(Number(snapshot.stdout.trim()) >= 1);
if (process.argv.includes('--restart')) {
  const restart = spawnSync('docker', ['compose', '-p', 'stayhub-reports-demo', '-f', 'docker-compose.reports.yml', 'restart', 'reports-db', 'reports-service'], { stdio: 'inherit' });
  assert.equal(restart.status, 0);
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { ready = (await fetch(url + '/health/ready', { signal: AbortSignal.timeout(2000) })).ok; } catch { ready = false; }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(ready, 'Reports recovers after restart');
  const persisted = spawnSync('docker', ['compose', '-p', 'stayhub-reports-demo', '-f', 'docker-compose.reports.yml', 'exec', '-T', 'reports-db', 'psql', '-U', 'stayhub_reports', '-d', 'reports_db', '-Atc', 'SELECT count(*) FROM "ReportSnapshot"'], { encoding: 'utf8' });
  assert.equal(persisted.status, 0); assert.equal(persisted.stdout.trim(), snapshot.stdout.trim());
  const response = await get('/reports/owner/' + owner + range);
  assert.equal(response.status, 200); assert.equal((await response.json()).metrics.occupancy.rate, 40);
  console.log('Reports restart PASS: snapshots and source results persist.');
}
console.log('Reports Docker smoke PASS: real source APIs, scoped JWT, exact per-currency revenue, 40% occupancy and PostgreSQL snapshot.');
