import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { launchTestChrome } from './verify-https-proxy.mjs';

export async function verifyOwnerReport({ base, property, ownerCredentials, guest, post, date }) {
  const stay = { checkIn: date(5), checkOut: date(7), guests: 2 };
  const result = await post('/bookings', { ...stay, propertyId: property.id, roomId: property.rooms[0].id },
    { ...guest, 'idempotency-key': randomUUID() });
  assert.equal(result.status, 201);
  const { id } = await result.json();
  const url = base + '/bookings/' + id;
  let browser;
  let cancelled = false;
  try {
    for (let attempt = 0; attempt < 60; attempt++) {
      const current = await fetch(url, { headers: guest });
      assert.equal(current.status, 200);
      if ((await current.json()).status === 'CONFIRMED') break;
      assert.ok(attempt < 59, 'La reserva no se confirmó');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    browser = await launchTestChrome();
    const page = await browser.newPage({ baseURL: process.env.STAYHUB_WEB_URL || 'http://localhost:5173' });
    await page.goto('/login');
    await page.locator('#email').fill(ownerCredentials.email);
    await page.locator('#password').fill(ownerCredentials.password);
    await page.locator('form button[type=submit]').click();
    await page.waitForURL(url => url.pathname !== '/login');
    await page.goto('/host/bookings');
    await page.getByLabel('Propiedad').selectOption(property.name);
    const row = page.getByRole('listitem').filter({ hasText: property.name });
    await row.getByText('Confirmada', { exact: true }).waitFor();
    assert.ok((await row.innerText()).includes(stay.checkIn + ' → ' + stay.checkOut));
    assert.ok((await row.getByRole('link', { name: 'Cancelar reserva' }).getAttribute('href')).includes(id));
    await page.goto('/host/reports');
    await page.getByLabel('Desde').fill(date(5));
    await page.getByLabel('Hasta (exclusivo)').fill(date(9));
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    await page.getByLabel('Alojamiento').selectOption(property.id);

    async function check(from, to, group, occupied, available) {
      await page.getByLabel('Desde').fill(from);
      await page.getByLabel('Hasta (exclusivo)').fill(to);
      await page.getByLabel('Agrupar').selectOption(group);
      const pending = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/reports/owner/' + property.ownerId) && new URL(r.url()).searchParams.get('propertyId') === property.id);
      await page.getByRole('button', { name: 'Aplicar filtros' }).click();
      const response = await pending;
      assert.equal(response.status(), 200);
      const data = await response.json();
      assert.deepEqual([data.source, data.propertyId, data.from, data.to, data.group], ['LIVE', property.id, from, to, group]);
      const rate = occupied * 100 / available;
      assert.deepEqual([data.metrics.occupancy.occupiedRoomNights, data.metrics.occupancy.availableRoomNights, data.metrics.occupancy.rate], [occupied, available, rate]);
      const card = page.getByRole('article').filter({ hasText: 'Ocupación reservada' });
      await card.getByText(rate + ' %', { exact: true }).waitFor();
      await card.getByText(occupied + ' noches reservadas / ' + available + ' disponibles').waitFor();
    }
    await check(date(5), date(9), 'day', 2, 4);
    await check(date(5), date(7), 'month', 2, 2);
    await check(date(7), date(8), 'day', 0, 1);
    assert.ok((await fetch(url, { method: 'DELETE', headers: guest })).ok);
    cancelled = true;
    await check(date(5), date(7), 'day', 0, 2);
    console.log('Chrome: reserva recibida por ID y fechas; ocupación LIVE 2/4, 2/2, 0/1 el día de salida y 0/2 tras cancelar.');
  } finally {
    try { if (!cancelled) assert.ok((await fetch(url, { method: 'DELETE', headers: guest })).ok); }
    finally { await browser?.close(); }
  }
}
