import assert from 'node:assert/strict';
import { createHash, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

export async function verifyHttpsProxy({ origin, credentials, propertyId }) {
  assert.equal(new URL(origin).protocol, 'https:');
  const certificate = new X509Certificate(readFileSync(process.env.STAYHUB_TEST_PROXY_CERT));
  const spki = certificate.publicKey.export({ type: 'spki', format: 'der' });
  const pin = createHash('sha256').update(spki).digest('base64');
  const browser = await chromium.launch({ channel: 'chrome', args: ['--ignore-certificate-errors-spki-list=' + pin] });
  try {
    const page = await browser.newPage({ baseURL: origin });
    const path = '/property/' + propertyId;
    const deepLink = await page.goto(path);
    assert.equal(deepLink.status(), 200);
    const reloaded = await page.reload();
    assert.equal(reloaded.status(), 200);
    const result = await page.evaluate(async propertyPath => {
      const detail = await fetch('/api/v1/properties/' + propertyPath);
      const property = await detail.json();
      const photo = await fetch('/api/v1/properties/' + property.id + '/photos/' + property.photos[0].id);
      const image = await createImageBitmap(await photo.blob());
      const absent = await fetch('/api/v1/properties/00000000-0000-4000-8000-000000000000');
      return [detail.status, photo.status, image.width, absent.status, absent.headers.get('content-type')];
    }, propertyId);
    assert.deepEqual(result.slice(0, 4), [200, 200, 1, 404]);
    assert.match(result[4], /json/);
    await page.goto('/login');
    await page.locator('#email').fill(credentials.email);
    await page.locator('#password').fill(credentials.password);
    await page.locator('form button[type=submit]').click();
    await page.waitForURL(url => url.pathname !== '/login');
    const cookie = (await page.context().cookies()).find(item => item.name === 'stayhub_refresh');
    assert.ok(cookie?.httpOnly && cookie.secure && cookie.sameSite === 'Strict');
    assert.equal(cookie.path, '/api/v1/auth/refresh');
    const refresh = page.waitForResponse(r => r.url() === new URL(cookie.path, origin).href && r.request().method() === 'POST');
    await page.reload();
    assert.equal((await refresh).status(), 200);
    console.log('Chrome HTTPS: ruta profunda y recarga, foto pública PNG, error API JSON, login y renovación correctos.');
  } finally { await browser.close(); }
}
