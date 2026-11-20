import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

async function tabTo(page, target) {
  for (let n = 0; n < 120; n++) {
    if (await target.evaluate(el => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw Error('Control inaccesible con Tab');
}

async function contrast(locator, property = 'color', minimum = 4.5) {
  const ratio = await locator.evaluate((el, property) => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    function rgba(color) {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      return ctx.getImageData(0, 0, 1, 1).data;
    }
    function lum(rgb) {
      const v = Array.from(rgb).slice(0, 3).map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722;
    }
    let bg = rgba('white');
    for (let node = el; node; node = node.parentElement) {
      const candidate = rgba(getComputedStyle(node).backgroundColor);
      if (candidate[3] === 255) { bg = candidate; break; }
    }
    const a = lum(bg), b = lum(rgba(getComputedStyle(el)[property]));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }, property);
  assert.ok(ratio >= minimum, property + ': contraste ' + ratio.toFixed(2));
  return ratio;
}

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ baseURL: process.env.STAYHUB_WEB_URL || 'http://localhost:5173', viewport: { width: 390, height: 844 } });
  const credentials = { email: 'forms-' + randomUUID() + '@stayhub.test', password: 'Test-' + randomUUID() };
  assert.equal((await page.request.post('/api/v1/auth/register', { data: { ...credentials, name: 'Prueba de formularios', role: 'GUEST' }, headers: { 'idempotency-key': randomUUID() } })).status(), 201);
  await page.goto('/login');
  await page.locator('#email').fill(credentials.email);
  await page.locator('#password').fill(credentials.password);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL(url => url.pathname !== '/login');
  await page.goto('/search?location=Bogot%C3%A1');
  const expand = page.getByRole('button', { name: /^Filtros/ });
  await tabTo(page, expand);
  await page.keyboard.press('Enter');
  const country = page.getByLabel('País (dos letras)');
  await tabTo(page, country);
  await page.keyboard.type('ZZ');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-invalid') === 'true');
  assert.ok(await country.evaluate(el => el === document.activeElement && document.getElementById(el.getAttribute('aria-describedby'))?.textContent));
  const ratios = [await contrast(page.locator('label').filter({ hasText: 'País (dos letras)' })), await contrast(page.getByRole('alert').first())];
  const borders = [await contrast(country, 'borderTopColor', 3)];
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('CO');
  await page.keyboard.press('Enter');
  await page.waitForURL(url => url.searchParams.get('countryCode') === 'CO');
  const card = page.getByRole('list', { name: 'Resultados' }).getByRole('link').first();
  await tabTo(page, card);
  await page.keyboard.press('Enter');
  const book = page.getByRole('link', { name: 'Reservar', exact: true }).first();
  await tabTo(page, book);
  await page.keyboard.press('Enter');
  const confirm = page.getByRole('button', { name: 'Confirmar reserva' });
  await tabTo(page, confirm);
  await page.keyboard.press('Enter');
  const alert = page.getByRole('alert');
  await alert.waitFor();
  assert.ok(await alert.evaluate(el => el === document.activeElement));
  const arrival = page.getByLabel('ENTRADA', { exact: true }), departure = page.getByLabel('SALIDA', { exact: true });
  for (const field of [arrival, departure]) assert.ok(await field.evaluate(el => el.getAttribute('aria-invalid') === 'true' && document.getElementById(el.getAttribute('aria-describedby'))?.textContent));
  ratios.push(await contrast(alert), await contrast(confirm), await contrast(page.getByText(/Crearemos tu reserva/)));
  borders.push(await contrast(arrival, 'borderTopColor', 3));
  const date = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  await tabTo(page, arrival);
  await arrival.fill(date(97));
  assert.equal(await departure.getAttribute('aria-invalid'), 'true');
  await tabTo(page, departure);
  await departure.fill(date(99));
  await page.getByText('Total', { exact: true }).waitFor();
  assert.equal(await alert.count(), 0);
  console.log('Filtros corregidos y estancia cotizada. Contraste mínimo medido: texto ' + Math.min(...ratios).toFixed(2) + ':1; bordes ' + Math.min(...borders).toFixed(2) + ':1.');
} finally { await browser.close(); }
