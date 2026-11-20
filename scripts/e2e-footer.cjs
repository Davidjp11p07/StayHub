const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ ...(process.env.STAYHUB_BROWSER_PATH ? { executablePath: process.env.STAYHUB_BROWSER_PATH } : { channel: 'chrome' }), headless: true });
  try {
    const page = await browser.newPage();
    const web = process.env.STAYHUB_WEB_URL || 'http://localhost:5173';
    const names = ['Centro de ayuda', 'Información de seguridad', 'Opciones de cancelación', 'StayHub.org', 'Programa de referidos', 'Viajeros accesibles', 'Recursos para anfitriones', 'Sala de prensa', 'Blog de viajes', 'Trabaja con nosotros', 'Privacidad', 'Condiciones', 'Empresa'];
    for (const name of names) {
      await page.goto(web, { waitUntil: 'domcontentloaded' });
      await page.locator('footer').getByRole('link', { name, exact: true }).click();
      await page.getByRole('heading', { name, exact: true }).waitFor({ timeout: 10000 });
    }
    for (const name of ['Publicar tu alojamiento', 'Panel de gestión']) {
      await page.goto(web, { waitUntil: 'domcontentloaded' });
      await page.locator('footer').getByRole('link', { name, exact: true }).click();
      await page.waitForURL('**/login', { timeout: 10000 });
    }
    console.log('Pie de página: 13 páginas informativas y 2 destinos protegidos verificados.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
