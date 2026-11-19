const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ ...(process.env.STAYHUB_BROWSER_PATH ? { executablePath: process.env.STAYHUB_BROWSER_PATH } : { channel: 'chrome' }), headless: true });
  try {
    const page = await browser.newPage();
    const web = process.env.STAYHUB_WEB_URL || 'http://localhost:5173';
    const propertyId = process.env.STAYHUB_TEST_PROPERTY_ID;
    if (!propertyId) throw new Error('Define STAYHUB_TEST_PROPERTY_ID para una propiedad sintética con fechas libres.');
    const offset = Number(process.env.STAYHUB_TEST_CHECKIN_OFFSET || 300);
    const date = days => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    const query = new URLSearchParams({ location: process.env.STAYHUB_TEST_CITY || 'Bogotá', countryCode: process.env.STAYHUB_TEST_COUNTRY || 'CO', checkIn: date(offset), checkOut: date(offset + 2) });
    const response = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/api/v1/search') && r.ok());
    await page.goto(`${web}/search?${query}`, { waitUntil: 'domcontentloaded' });
    const result = (await (await response).json()).items.find(item => item.accommodationId === propertyId);
    if (!result) throw new Error('La búsqueda fechada no devolvió la propiedad.');
    const card = page.getByRole('link').filter({ hasText: result.name });
    await card.waitFor();
    const photo = card.getByRole('img', { name: result.name });
    await photo.scrollIntoViewIfNeeded();
    await page.waitForFunction(img => img.complete && img.naturalWidth > 0, await photo.elementHandle());
    const price = new Intl.NumberFormat('es', { style: 'currency', currency: result.currency, maximumFractionDigits: 2 });
    await card.getByText(price.format(result.minNightlyPrice), { exact: true }).waitFor();
    await card.click();
    await page.waitForURL(`**/property/${propertyId}`);
    await page.getByRole('heading', { name: result.name }).waitFor();
    query.set('page', '999');
    await page.goto(`${web}/search?${query}`);
    await page.getByRole('button', { name: 'Ir a la última página' }).click();
    await page.getByRole('list', { name: 'Resultados' }).waitFor();
    console.log('País, ciudad, fechas, tarjeta, precio, foto, detalle y recuperación de página verificados.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
