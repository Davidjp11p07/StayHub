const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ ...(process.env.STAYHUB_BROWSER_PATH ? { executablePath: process.env.STAYHUB_BROWSER_PATH } : { channel: 'chrome' }), headless: true });
  try {
    const page = await browser.newPage();
    const web = process.env.STAYHUB_WEB_URL || 'http://localhost:5173';
    await page.goto(`${web}/search?location=Bogot%C3%A1&checkIn=2027-06-01&checkOut=2027-06-03`, { waitUntil: 'domcontentloaded' });
    await page.getByText('La información de disponibilidad puede estar incompleta', { exact: false }).waitFor({ timeout: 30000 });
    console.log('La búsqueda sin ventanas proyectadas informa que los datos pueden estar incompletos.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
