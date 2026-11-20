import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const base = 'https://127.0.0.1:18080/api/v1';
const credentials = { email: `verifier-${randomUUID()}@stayhub.test`, password: `Test-${randomUUID()}` };
async function post(path, body, headers = {}) {
  return fetch(base + path, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
}
async function register(role) {
  return post('/auth/register', { name: 'Verificación sintética', ...credentials, role }, { 'idempotency-key': randomUUID() });
}

assert.equal((await register('VERIFIER')).status, 400);
const registered = await register('GUEST');
assert.equal(registered.status, 201);
const { id } = await registered.json();
assert.match(id, /^[0-9a-f-]{36}$/i);
const assignment = readFileSync(new URL('./assign-property-verifier.sql', import.meta.url));
for (let attempt = 0; attempt < 2; attempt++) {
  execFileSync('docker', ['exec', '-i', 'stayhub-integracion-local-users-db-1', 'psql', '-X', '-U', 'users',
    '-d', 'users_db', '-v', `user_id=${id}`], { input: assignment });
}
const login = await post('/auth/login', credentials);
assert.equal(login.status, 200);
const { accessToken, user } = await login.json();
assert.equal(user.role, 'VERIFIER');
const headers = { authorization: `Bearer ${accessToken}` };
const profile = await fetch(`${base}/users/${id}/profile`, { headers });
assert.equal(profile.status, 200);
assert.equal((await profile.json()).role, 'VERIFIER');
const report = await fetch(`${base}/reports/owner/${id}`, { headers });
assert.equal(report.status, 403);
console.log('Registro VERIFIER 400, asignación repetida, login VERIFIER 200, perfil propio 200, reporte restringido 403.');
const ownerCredentials = { email: `review-owner-${randomUUID()}@stayhub.test`, password: `Test-${randomUUID()}` };
assert.equal((await post('/auth/register', { name: 'Propietario sintético', ...ownerCredentials, role: 'OWNER' },
  { 'idempotency-key': randomUUID() })).status, 201);
const ownerLogin = await post('/auth/login', ownerCredentials);
assert.equal(ownerLogin.status, 200);
const owner = { authorization: `Bearer ${(await ownerLogin.json()).accessToken}` };
const draft = {
  type: 'HOUSE', name: `Revisión ${randomUUID()}`, location: { addressLine: 'Calle 1', city: 'Bogota', region: 'Cundinamarca', country: 'CO' },
  rooms: [{ name: 'Habitación', capacity: 2, basePrice: { amount: '120000.00', currency: 'COP' } }],
};
const created = await post('/properties', draft, owner);
assert.equal(created.status, 201);
const property = await created.json();
const path = `/properties/${property.id}`;
const form = new FormData();
form.append('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64')], { type: 'image/png' }), 'review.png');
assert.equal((await fetch(base + path + '/photos', { method: 'POST', headers: owner, body: form })).status, 201);
const submit = version => post(path + '/verification', { version }, owner);
const decision = (version, status, actor) => post(path + '/verification/decision', { version, status, reason: 'Revisión de evidencia sintética' }, actor);
const edit = (version, status) => fetch(base + path, { method: 'PUT', headers: { ...owner, 'content-type': 'application/json' },
  body: JSON.stringify({ ...draft, featureCodes: [], rooms: property.rooms, version, status }) });
assert.equal((await edit(property.version, 'PUBLISHED')).status, 403);
const guestCredentials = { email: `review-guest-${randomUUID()}@stayhub.test`, password: `Test-${randomUUID()}` };
assert.equal((await post('/auth/register', { name: 'Huesped de prueba', ...guestCredentials, role: 'GUEST' }, { 'idempotency-key': randomUUID() })).status, 201);
const guestToken = (await (await post('/auth/login', guestCredentials)).json()).accessToken;
const guest = { authorization: `Bearer ${guestToken}` };
const date = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const book = offset => post('/bookings', { propertyId: property.id, roomId: property.rooms[0].id,
  checkIn: date(offset), checkOut: date(offset + 1), guests: 1 }, { ...guest, 'idempotency-key': randomUUID() });
async function checkSearch(expected) {
  for (let i = 0; i < 30; i++) {
    const response = await fetch(base + '/search?' + new URLSearchParams({ q: draft.name }));
    assert.equal(response.status, 200);
    if ((await response.json()).items.some(item => item.accommodationId === property.id) === expected) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.fail('Search no reflejo el estado de la propiedad');
}
assert.equal((await submit(property.version)).status, 200);
assert.equal((await fetch(base + path)).status, 404);
assert.equal((await book(120)).status, 404);
await checkSearch(false);
assert.equal((await decision(property.version, 'APPROVED', owner)).status, 403);
assert.equal((await decision(property.version, 'REJECTED', headers)).status, 200);
assert.equal((await fetch(base + path)).status, 404);
assert.equal((await book(120)).status, 404);
await checkSearch(false);
const revised = await edit(property.version, 'DRAFT');
assert.equal(revised.status, 200);
const { version } = await revised.json();
assert.equal((await submit(version)).status, 200);
const queue = await fetch(base + '/properties/verification/pending', { headers });
assert.equal(queue.status, 200);
assert.ok((await queue.json()).some(row => row.propertyId === property.id && row.version === version));
if (process.env.STAYHUB_TEST_BROWSER === '1') {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ ignoreHTTPSErrors: true });
    const web = process.env.STAYHUB_WEB_URL || 'http://localhost:5173';
    await page.goto(web + '/login');
    await page.locator('#email').fill(credentials.email);
    await page.locator('#password').fill(credentials.password);
    await page.locator('form button[type=submit]').click();
    await page.waitForURL(url => url.pathname !== '/login');
    await page.goto(web + '/verification');
    await page.getByRole('button', { name: draft.name, exact: true }).click();
    await page.waitForFunction(() => document.querySelector('main img')?.naturalWidth > 0);
    await page.getByLabel('Motivo de la decisión').fill('Revisión de evidencia sintética');
    await page.getByRole('button', { name: 'Aprobar y publicar' }).click();
    await page.getByRole('button', { name: draft.name, exact: true }).waitFor({ state: 'detached' });
    console.log('Chrome: evidencia visible y aprobación desde el panel.');
  } finally { await browser.close(); }
}
assert.equal((await decision(version, 'APPROVED', headers)).status, 200);
assert.equal((await decision(version, 'APPROVED', headers)).status, 200);
const visible = await fetch(base + path);
assert.equal(visible.status, 200);
assert.equal((await visible.json()).status, 'PUBLISHED');
const detail = await fetch(base + path + '/verification', { headers: owner });
assert.equal(detail.status, 200);
const { history } = await detail.json();
assert.deepEqual(history.map(row => row.status), ['APPROVED', 'REJECTED']);
assert.ok(history.every(row => row.reviewerId === user.userId && row.reason && row.decidedAt));
console.log('Propiedad sintética: publicación directa denegada, rechazo, corrección, aprobación idempotente y dos decisiones trazables.');

await checkSearch(true);
const reservation = await book(120);
assert.equal(reservation.status, 201);
const booking = await reservation.json();
assert.equal((await edit(version + 1, 'UNPUBLISHED')).status, 200);
await checkSearch(false);
assert.equal((await book(122)).status, 404);
const prior = await fetch(base + '/bookings/' + booking.id, { headers: guest });
assert.equal(prior.status, 200);
assert.equal((await prior.json()).id, booking.id);
assert.equal((await fetch(base + '/bookings/' + booking.id, { method: 'DELETE', headers: guest })).ok, true);
console.log('Search, nuevas reservas y consulta de la reserva anterior verificados tras despublicar.');
