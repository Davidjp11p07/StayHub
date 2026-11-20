import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

export async function verifyGuestReview({ base, property, owner, guest, guestCredentials, post, date }) {
  const result = await post('/bookings', { propertyId: property.id, roomId: property.rooms[0].id,
    checkIn: date(0), checkOut: date(1), guests: 1 }, { ...guest, 'idempotency-key': randomUUID() });
  assert.equal(result.status, 201);
  const { id } = await result.json();
  const path = '/bookings/' + id;
  for (let i = 0; i < 60; i++) {
    const current = await fetch(base + path, { headers: guest });
    assert.equal(current.status, 200);
    if ((await current.json()).status === 'CONFIRMED') break;
    assert.ok(i < 59, 'La reserva no se confirmó');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const review = { bookingId: id, rating: 4, comment: 'Estancia de prueba ' + id };
  const checkIn = await post(path + '/check-in', undefined, owner);
  assert.equal(checkIn.status, 200);
  assert.equal((await checkIn.json()).status, 'CHECKED_IN');
  assert.equal((await post('/reviews', review, guest)).status, 404);
  const checkOut = await post(path + '/check-out', undefined, owner);
  assert.equal(checkOut.status, 200);
  assert.equal((await checkOut.json()).status, 'COMPLETED');
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage({ baseURL: process.env.STAYHUB_WEB_URL || 'http://localhost:5173' });
    await page.goto('/login');
    await page.locator('#email').fill(guestCredentials.email);
    await page.locator('#password').fill(guestCredentials.password);
    await page.locator('form button[type=submit]').click();
    await page.waitForURL(url => url.pathname !== '/login');
    let notice;
    for (let i = 0; i < 60; i++) {
      const list = await fetch(base + '/notifications', { headers: guest });
      assert.equal(list.status, 200);
      notice = (await list.json()).items.find(item => item.type === 'BOOKING_CONFIRMATION' && item.body.includes(id));
      if (notice) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(notice, 'No llegó la notificación de la reserva');
    assert.equal(notice.readAt, null);
    const markUrl = base + '/notifications/' + notice.id + '/read';
    assert.equal((await fetch(markUrl, { method: 'PATCH', headers: owner })).status, 404);
    await page.goto('/bookings');
    await page.getByRole('button', { name: 'Notificaciones' }).click();
    const article = page.getByRole('article').filter({ hasText: notice.subject });
    await article.getByRole('button', { name: 'Marcar como leída' }).click();
    await article.getByText('Leída', { exact: true }).waitFor();
    await page.reload();
    await page.getByRole('button', { name: 'Notificaciones' }).click();
    await article.getByText('Leída', { exact: true }).waitFor();
    const persisted = (await (await fetch(base + '/notifications', { headers: guest })).json()).items.find(item => item.id === notice.id);
    assert.ok(Date.parse(persisted.readAt));
    const repeated = await fetch(markUrl, { method: 'PATCH', headers: guest });
    assert.equal(repeated.status, 200);
    assert.equal((await repeated.json()).readAt, persisted.readAt);
    console.log('Chrome: aviso de confirmación recibido, leído y conservado al recargar. API: lectura privada e idempotente.');
    await page.goto(path + '/review');
    await page.getByRole('button', { name: '4 estrellas' }).click();
    await page.getByLabel('Tu comentario').fill(review.comment);
    await page.getByRole('button', { name: 'Publicar reseña' }).click();
    await page.getByRole('link', { name: 'Ver el alojamiento' }).click();
    await page.getByText(review.comment, { exact: true }).waitFor();
    const publicPage = await fetch(base + '/properties/' + property.id + '/reviews');
    assert.equal(publicPage.status, 200);
    const data = await publicPage.json();
    assert.equal(data.total, 1);
    assert.equal(data.items[0].rating, 4);
    assert.equal(data.items[0].comment, review.comment);
    assert.equal((await post('/reviews', review, guest)).status, 409);
    console.log('Reseña verificada: check-in, rechazo previo 404, salida anticipada, publicación en Chrome, lectura pública con 4 estrellas y duplicado 409.');
  } finally { await browser.close(); }
}
