const { chromium } = require('playwright');
let browser; let page;
(async () => {
  const web = process.env.STAYHUB_WEB_URL || 'http://localhost:5173';
  const city = process.env.STAYHUB_TEST_CITY || 'Bogotá';
  browser = await chromium.launch({ ...(process.env.STAYHUB_BROWSER_PATH ? { executablePath: process.env.STAYHUB_BROWSER_PATH } : { channel: 'chrome' }), headless: true });
  console.log('Navegador iniciado.');
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const response = await page.request.get(`${web}/api/v1/search?location=${encodeURIComponent(city)}`);
  if (!response.ok()) throw new Error(`Search respondió ${response.status()}`);
  const { total } = await response.json();
  console.log(`Search: ${total} resultados.`);
  await page.goto(web, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByRole('button', { name: 'Abrir asistente' }).click();
  await page.getByLabel('Tu pregunta').fill(`¿Cuántos inmuebles hay en ${city}?`);
  await page.getByRole('button', { name: 'Enviar' }).click();
  const answer = page.locator('#stayhub-chat p').filter({ hasText: `Hay ${total} alojamiento${total === 1 ? '' : 's'} publicado${total === 1 ? '' : 's'} en ${city} en el catálogo de búsqueda.` });
  await answer.waitFor({ timeout: 30000 });
  const details = answer.locator('..').locator('details');
  await details.locator('summary').click();
  await details.getByText(`Resultados recuperados: ${total}.`, { exact: false }).waitFor();
  const allResponse = await page.request.get(`${web}/api/v1/search?pageSize=1`);
  const all = (await allResponse.json()).total;
  await page.getByLabel('Tu pregunta').fill('cuantos inmbuebles hay en total');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await page.locator('#stayhub-chat p').filter({ hasText: `Hay ${all} alojamientos publicados en el catálogo de búsqueda.` }).waitFor({ timeout: 30000 });
  await page.getByLabel('Tu pregunta').fill('no, en todo stayhub');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await page.waitForFunction(({ total }) => [...document.querySelectorAll('#stayhub-chat p')].filter(p => p.textContent?.includes(`Hay ${total} alojamientos publicados en el catálogo de búsqueda.`)).length >= 2, { total: all }, { timeout: 30000 });
  for (const [place, query, label] of [
    ['Colombia', 'countryCode=CO', 'CO'], ['co', 'countryCode=CO', 'CO'],
    ['Bogota, Colombia', 'location=Bogotá&countryCode=CO', 'Bogota, CO'],
    ['México', 'countryCode=MX', 'MX'],
  ]) {
    const result = await page.request.get(web + '/api/v1/search?' + query);
    if (!result.ok()) throw Error('Search: ' + result.status());
    const expected = (await result.json()).total;
    await page.getByLabel('Tu pregunta').fill('¿Cuántos alojamientos hay en ' + place + '?');
    const received = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/chat') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Enviar' }).click();
    const response = await received;
    if (!response.ok()) throw Error('Chat: ' + response.status());
    const reply = (await response.json()).reply;
    if (!reply?.startsWith('Hay ' + expected + ' alojamiento') || !reply.includes(' en ' + label + ' en el catálogo')) throw Error('Conteo inesperado: ' + reply);
    await page.locator('#stayhub-chat p').filter({ hasText: reply }).last().waitFor();
    console.log(place + ': ' + expected);
  }
  await page.screenshot({ path: '.artifacts/chat-count-verified.png' });
  console.log(`Conteos verificados con Search: ciudad ${total}, total ${all}; explicación visible.`);
  await browser.close();
})().catch(async error => { console.error(error.message); if (page) console.error('Chat:', await page.locator('#stayhub-chat').innerText().catch(() => 'no disponible')); await browser?.close(); process.exitCode = 1; });
