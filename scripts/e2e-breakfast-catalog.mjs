import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

const base = 'https://127.0.0.1:18080/api/v1';
const web = process.env.STAYHUB_WEB_URL || 'http://localhost:5173';
const credentials = { email: `breakfast-${randomUUID()}@stayhub.test`, password: `Test-${randomUUID()}` };
async function post(path, body, headers = {}) {
  return fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
assert.equal((await post('/auth/register', { ...credentials, name: 'Propietario de prueba', role: 'OWNER' }, { 'idempotency-key': randomUUID() })).status, 201);
const login = await post('/auth/login', credentials);
assert.equal(login.status, 200);
const headers = { authorization: `Bearer ${(await login.json()).accessToken}` };
const created = await post('/properties', { name: 'Desayuno de prueba', type: 'HOUSE',
  location: { addressLine: 'Calle 1', city: 'Bogota', region: 'Cundinamarca', country: 'CO' },
  rooms: [{ name: 'Habitación', capacity: 2, basePrice: { amount: '90000', currency: 'COP' } }],
}, headers);
assert.equal(created.status, 201);
const { id } = await created.json();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  await page.goto(web + '/login');
  await page.locator('#email').fill(credentials.email);
  await page.locator('#password').fill(credentials.password);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL(url => url.pathname !== '/login');
  for (const amount of ['12000.50', '']) {
    await page.goto(web + '/host/properties/' + id + '/edit');
    const field = page.getByLabel('Desayuno opcional por huésped y noche (COP)');
    await field.waitFor();
    assert.equal(await field.inputValue(), amount ? '' : '12000.50');
    await field.fill(amount);
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await page.waitForURL(url => url.pathname === '/property/' + id);
    const response = await fetch(base + '/properties/' + id, { headers });
    assert.equal(response.status, 200);
    const room = (await response.json()).rooms[0];
    assert.deepEqual(room.breakfastPerGuestNight, amount ? { amount, currency: 'COP' } : undefined);
    assert.equal(room.basePrice.amount, '90000.00');
  }
  console.log('Chrome y Gateway: tarifa de desayuno guardada, recargada y retirada; precio de habitación conservado.');
} finally { await browser.close(); }
