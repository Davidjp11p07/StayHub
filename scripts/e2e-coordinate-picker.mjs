import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ baseURL: process.env.STAYHUB_WEB_URL || 'http://localhost:5173' });
  const credentials = { email: 'map-' + randomUUID() + '@stayhub.test', password: 'Test-' + randomUUID() };
  const registration = await page.request.post('/api/v1/auth/register', {
    data: { ...credentials, role: 'OWNER', name: 'Prueba de mapa' }, headers: { 'idempotency-key': randomUUID() },
  });
  assert.equal(registration.status(), 201);
  await page.goto('/login');
  await page.locator('#email').fill(credentials.email);
  await page.locator('#password').fill(credentials.password);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL(url => url.pathname !== '/login');
  await page.goto('/host/new');
  const map = page.getByRole('region', { name: 'Mapa para seleccionar coordenadas' });
  const lat = page.getByLabel('Latitud (opcional)');
  const lon = page.getByLabel('Longitud (opcional)');
  await map.waitFor();
  assert.equal(await lat.inputValue(), '');
  assert.equal(await lon.inputValue(), '');
  assert.equal(await map.locator('.leaflet-marker-icon').count(), 0);
  await page.getByLabel('Tipo de alojamiento').selectOption('HOUSE');
  for (const [label, value] of [['Nombre','Prueba sintética de mapa'], ['Dirección','Dirección sintética'], ['Ciudad','Ciudad de prueba'],
    ['Región o estado','Región de prueba'], ['Nombre de la habitación','Habitación'], ['Capacidad','2'], ['Precio por noche','100000']]) {
    await page.getByLabel(label, { exact: true }).fill(value);
  }
  await page.getByLabel(/País/).fill('CO');
  await map.click({ position: { x: 180, y: 120 } });
  await map.locator('.leaflet-marker-icon').waitFor();
  const selected = [await lat.inputValue(), await lon.inputValue()].map(Number);
  await page.getByRole('button', { name: 'Guardar como borrador' }).click();
  await page.waitForURL(url => url.pathname.startsWith('/property/'));
  const id = new URL(page.url()).pathname.split('/').pop();
  const edit = '/host/properties/' + id + '/edit';
  await page.goto(edit);
  await map.locator('.leaflet-marker-icon').waitFor();
  assert.deepEqual([await lat.inputValue(), await lon.inputValue()].map(Number), selected);
  await lat.fill('0');
  await lon.fill('0');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await page.waitForURL(url => url.pathname === '/property/' + id);
  assert.match(await page.getByTitle(/Mapa de ubicación/).getAttribute('src'), /marker=0,0/);
  await page.goto(edit);
  await lat.fill('');
  await lon.fill('');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await page.waitForURL(url => url.pathname === '/property/' + id);
  await page.getByText(/aún no indicó la ubicación exacta/).waitFor();
  console.log('Chrome: borrador creado por clic, marcador recargado, coordenadas manuales 0,0 guardadas y ubicación retirada.');
} finally { await browser.close(); }
