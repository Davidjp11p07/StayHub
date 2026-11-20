const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function tabTo(page, target) {
  for (let i = 0; i < 100; i++) {
    if (await target.evaluate(el => document.activeElement === el)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('No se alcanzó el control con Tab');
}

async function fits(page, stage) {
  const widths = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  assert.ok(widths[0] <= widths[1], stage + ': ancho de contenido ' + widths[0] + ', ventana ' + widths[1]);
}

async function loaded(image) {
  await image.scrollIntoViewIfNeeded();
  await image.evaluate(async img => { await img.decode(); if (!img.naturalWidth) throw Error('Foto vacía'); });
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    for (const width of [320, 390, 1280]) {
      const page = await browser.newPage({ baseURL: process.env.STAYHUB_WEB_URL || 'http://localhost:5173', viewport: { width, height: 800 } });
      const results = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/api/v1/search') && r.ok());
      await page.goto('/search?location=Bogot%C3%A1');
      const listing = (await (await results).json()).items.find(item => item.primaryPhotoUrl);
      assert.ok(listing, 'Se requiere un alojamiento publicado con foto en Bogotá');
      const card = page.getByRole('link').filter({ hasText: listing.name }).first();
      await loaded(card.getByRole('img', { name: listing.name }));
      await fits(page, 'Búsqueda');
      await tabTo(page, card);
      await page.keyboard.press('Enter');
      await page.waitForURL('**/property/' + listing.accommodationId);
      const thumbnail = page.getByRole('button', { name: /^Ver foto 1 / });
      await loaded(thumbnail.getByRole('img'));
      await fits(page, 'Detalle');
      await tabTo(page, thumbnail);
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: /Galería de fotos/ });
      await loaded(dialog.getByRole('img'));
      await fits(page, 'Galería');
      for (const key of ['Shift+Tab', 'Tab']) {
        await page.keyboard.press(key);
        assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)));
      }
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      assert.ok(await thumbnail.evaluate(el => document.activeElement === el));
      console.log(width + ' px: fotos cargadas, navegación por teclado y ancho verificados.');
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
