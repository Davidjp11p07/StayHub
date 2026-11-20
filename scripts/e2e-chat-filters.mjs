import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, baseURL: process.env.STAYHUB_WEB_URL || 'http://localhost:5173' });
  const date = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const checkIn = date(90), checkOut = date(92);
  const filters = new URLSearchParams({ location: 'Bogotá', checkIn, checkOut, guests: '2', maxPrice: '250000', currency: 'COP', amenities: 'wifi', pageSize: '10' });
  const search = await page.request.get('/api/v1/search?' + filters);
  assert.equal(search.status(), 200);
  const { items, total } = await search.json();
  assert.ok(total > 0, 'Se requiere un alojamiento publicado en Bogotá con wifi y tarifa de hasta 250000 COP.');
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir asistente' }).click();
  const input = page.getByLabel('Tu pregunta');
  const question = 'Busco alojamiento en Bogotá del ' + checkIn + ' al ' + checkOut + ' para 2 personas con wifi y máximo 250000 COP.';
  await input.fill(question);
  const pending = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/chat') && r.request().method() === 'POST', { timeout: 190000 });
  await page.getByRole('button', { name: 'Enviar' }).click();
  const response = await pending;
  assert.equal(response.status(), 201);
  const { reply, explanation } = await response.json();
  for (const term of ['ubicación: Bogotá', 'fechas: ' + checkIn + ' a ' + checkOut, 'huéspedes: 2', 'precio máximo: 250000 COP', 'servicios: wifi', 'Resultados recuperados: ' + total + '.']) {
    assert.ok(explanation.toLocaleLowerCase().includes(term.toLocaleLowerCase()), 'Filtro ausente: ' + term + '. ' + explanation);
  }
  for (const item of items.slice(0, 5)) {
    assert.ok(reply.includes(item.name));
    assert.ok(reply.includes(item.minNightlyPrice + ' ' + item.currency));
  }
  await page.locator('#stayhub-chat p').filter({ hasText: items[0].name }).first().waitFor();
  console.log('Chrome y Search coincidieron en filtros, total y tarifas de ' + total + ' resultados.');
  if (process.env.STAYHUB_TEST_OFFLINE_CHAT === '1') {
    await page.route('**/api/v1/chat', async route => {
      const actual = await page.request.post('https://127.0.0.1:18443/api/v1/chat', { data: route.request().postDataJSON() });
      await route.fulfill({ response: actual });
    });
    await page.getByRole('button', { name: 'Limpiar' }).click();
    const offlineQuestion = '¿Cómo puedo encontrar alojamiento?';
    await input.fill(offlineQuestion);
    const failed = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/chat'));
    await page.getByRole('button', { name: 'Enviar' }).click();
    assert.equal((await failed).status(), 503);
    await page.getByRole('alert').filter({ hasText: 'El asistente no está disponible' }).waitFor();
    assert.equal(await input.inputValue(), offlineQuestion);
    await input.fill('¿Cuántos alojamientos hay en Bogotá?');
    const city = await page.request.get('/api/v1/search?location=Bogot%C3%A1');
    assert.equal(city.status(), 200);
    const count = (await city.json()).total;
    await page.getByRole('button', { name: 'Enviar' }).click();
    await page.locator('#stayhub-chat p').filter({ hasText: 'Hay ' + count + ' alojamiento' }).waitFor();
    console.log('Gateway sin Ollama: HTTP 503 y pregunta conservada; conteo de Bogotá disponible: ' + count);
  }
} finally { await browser.close(); }
