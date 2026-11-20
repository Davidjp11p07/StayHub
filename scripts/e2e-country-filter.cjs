const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');

(async () => {
  const web = process.env.STAYHUB_WEB_URL || 'http://localhost:5173';
  const browser = await chromium.launch(process.env.STAYHUB_BROWSER_PATH
    ? { executablePath: process.env.STAYHUB_BROWSER_PATH } : { channel: 'chrome' });
  try {
    const page = await browser.newPage({ baseURL: web });
    const api = page.request;
    const location = 'Bogot%C3%A1';
    const search = async code => {
      const response = await api.get('/api/v1/search?location=' + location + '&countryCode=' + code);
      assert.equal(response.status(), 200);
      return response.json();
    };
    const upper = await search('CO');
    const lower = await search('co');
    assert.ok(upper.total > 0);
    assert.equal(lower.total, upper.total);
    assert.deepEqual(lower.items.map(i => i.accommodationId), upper.items.map(i => i.accommodationId));
    assert.equal((await api.get('/api/v1/search?countryCode=ZZ')).status(), 400);
    await page.goto('/search?location=' + location + '&countryCode=co');
    await page.getByRole('link').filter({ hasText: upper.items[0].name }).first().waitFor();
    console.log('Gateway y Chrome: CO y co devuelven los mismos alojamientos de Bogotá; ZZ devuelve 400.');

    const credentials = { email: 'iso-' + randomUUID() + '@stayhub.test', password: 'Test-' + randomUUID() };
    const registration = await api.post('/api/v1/auth/register', {
      data: { ...credentials, name: 'Prueba de país', role: 'OWNER' }, headers: { 'idempotency-key': randomUUID() },
    });
    assert.equal(registration.status(), 201);
    const login = await api.post('/api/v1/auth/login', { data: credentials });
    assert.equal(login.status(), 200);
    const { accessToken } = await login.json();
    const create = await api.post('/api/v1/properties', {
      headers: { authorization: 'Bearer ' + accessToken },
      data: { type: 'HOUSE', name: 'Prueba de país', location: { addressLine: 'Calle 1', city: 'Bogotá', region: 'Bogotá', country: 'ZZ' },
        rooms: [{ name: 'Habitación', capacity: 2, basePrice: { amount: '100000.00', currency: 'COP' } }] },
    });
    assert.equal(create.status(), 400);
    assert.match(await create.text(), /location\.country/);
    console.log('Gateway y Accommodations: alta con país ZZ rechazada en location.country.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
