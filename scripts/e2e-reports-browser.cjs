const { chromium } = require('playwright');
const { randomUUID } = require('crypto');
(async () => {
  const browser = await chromium.launch({ ...(process.env.STAYHUB_BROWSER_PATH ? { executablePath: process.env.STAYHUB_BROWSER_PATH } : { channel: 'chrome' }), headless: true });
  try {
    const page = await browser.newPage();
    const web = process.env.STAYHUB_WEB_URL || 'http://localhost:5173';
    const email = `reports-${randomUUID()}@stayhub.test`, password = `Test-${randomUUID()}`;
    await page.goto(`${web}/register`, { waitUntil: 'domcontentloaded' });
    await page.locator('#register-name').fill('Reportes Prueba');
    await page.locator('#register-email').fill(email);
    await page.locator('#register-role').selectOption('OWNER');
    await page.locator('#register-password').fill(password);
    await page.locator('#register-confirm').fill(password);
    await page.locator('form button[type=submit]').click();
    await page.waitForURL('**/login*', { timeout: 30000 });
    await page.locator('#email').fill(email); await page.locator('#password').fill(password);
    await page.locator('form button[type=submit]').click();
    await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 30000 });
    const response = page.waitForResponse(r => r.url().includes('/api/v1/reports/owner/') && r.request().method() === 'GET', { timeout: 30000 });
    await page.goto(`${web}/host/reports`, { waitUntil: 'domcontentloaded' });
    const result = await response;
    console.log(`Reports HTTP ${result.status()}: ${(await result.text()).slice(0, 600)}`);
    if (!result.ok()) throw Error('No se pudo cargar el reporte.');
    await page.getByRole('heading', { name: 'Tu actividad, en perspectiva' }).waitFor();
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
