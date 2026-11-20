import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

export async function verifyRoomInventory({ base, property, owner, ownerCredentials, guest, post, date }) {
  const roomId = property.rooms[0].id;
  const path = base + '/inventory/rooms/' + roomId;
  const stay = { checkIn: date(25), checkOut: date(27), guests: 2 };
  async function available(expected) {
    const params = new URLSearchParams({ ...stay, guests: String(stay.guests), q: property.name });
    const response = await fetch(base + '/search?' + params);
    assert.equal(response.status, 200);
    const { items } = await response.json();
    assert.equal(items.some(item => item.accommodationId === property.id), expected);
  }

  await available(true);
  assert.equal((await fetch(path, { headers: guest })).status, 403);
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage({ baseURL: process.env.STAYHUB_WEB_URL || 'http://localhost:5173' });
    await page.goto('/login');
    await page.locator('#email').fill(ownerCredentials.email);
    await page.locator('#password').fill(ownerCredentials.password);
    await page.locator('form button[type=submit]').click();
    await page.waitForURL(url => url.pathname !== '/login');
    await page.goto('/host/properties/' + property.id + '/edit');
    await page.getByRole('link', { name: /Gestionar inventario/ }).click();
    await page.getByLabel('Nombre').fill('Toallas de prueba');
    await page.getByLabel('Cantidad').fill('3');
    await page.getByRole('button', { name: 'Agregar' }).click();
    const row = page.getByRole('listitem').filter({ hasText: 'Toallas de prueba' });
    await row.getByRole('button', { name: 'Desactivar' }).click();
    await row.getByRole('button', { name: 'Activar', exact: true }).waitFor();
    await page.reload();
    await row.getByRole('button', { name: 'Activar', exact: true }).waitFor();
    const response = await fetch(path, { headers: owner });
    assert.equal(response.status, 200);
    const { items } = await response.json();
    assert.equal(items.length, 1);
    assert.equal(items[0].quantityAvailable, 3);
    assert.equal(items[0].active, false);
    await available(true);
  } finally { await browser.close(); }

  const result = await post('/bookings', { propertyId: property.id, roomId, ...stay }, { ...guest, 'idempotency-key': randomUUID() });
  assert.equal(result.status, 201);
  const { id } = await result.json();
  try { await available(false); }
  finally { assert.ok((await fetch(base + '/bookings/' + id, { method: 'DELETE', headers: guest })).ok); }
  await available(true);
  console.log('Chrome: producto añadido y desactivado; cantidad y estado persistentes. Huésped: inventario 403, habitación disponible, ocupada al reservar y libre al cancelar.');
}
