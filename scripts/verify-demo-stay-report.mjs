import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const readState = async name => JSON.parse(await readFile('.artifacts/' + name + '.json', 'utf8'));
const owner = await readState('demo-properties-state');
const { stay } = await readState('demo-completed-stay');
const base = 'http://localhost:5173/api/v1';
const login = await fetch(base + '/auth/login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: owner.email, password: owner.password }),
});
assert.equal(login.status, 200, 'Login del propietario');
const { user, accessToken } = await login.json();
const propertyId = owner.properties['CO-Leticia'].id;
assert.equal(propertyId, stay.propertyId);
const params = new URLSearchParams({ propertyId, from: stay.checkIn, to: stay.checkOut, group: 'day' });
const key = createHash('sha256').update(JSON.stringify([
  user.userId, stay.checkIn, stay.checkOut, 'day', propertyId, 'LIVE',
])).digest('hex');

for (let attempt = 0; attempt < 2; attempt++) {
  const res = await fetch(base + '/reports/owner/' + user.userId + '?' + params, {
    headers: { authorization: 'Bearer ' + accessToken },
  });
  assert.equal(res.status, 200);
  const report = await res.json();
  assert.deepEqual([report.ownerId, report.from, report.to, report.group, report.propertyId, report.source],
    [user.userId, stay.checkIn, stay.checkOut, 'day', propertyId, 'LIVE']);
  assert.equal(report.metrics.reservations.total, 1);
  assert.deepEqual(report.metrics.reservations.byStatus, { COMPLETED: 1 });
  assert.deepEqual(report.metrics.revenue, [{
    currency: 'COP', chargedMinor: '12000000', refundedMinor: '0', netMinor: '12000000',
  }]);
  const occupancy = report.metrics.occupancy;
  assert.deepEqual([occupancy.occupiedRoomNights, occupancy.availableRoomNights, occupancy.rate], [1, 1, 100]);
  const stored = execFileSync('docker', ['exec', '-i', 'stayhub-integracion-local-reports-db-1',
    'psql', '-XAtq', '-v', 'ON_ERROR_STOP=1', '-U', 'stayhub_reports', '-d', 'reports_db'],
  { input: `SELECT payload FROM "ReportSnapshot" WHERE key = '${key}';`, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(stored), report);
}
console.log('Leticia: reporte LIVE e instantánea coinciden en dos consultas. Una noche completada, 120000 COP netos.');
