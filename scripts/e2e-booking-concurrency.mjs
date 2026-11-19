import { randomUUID } from 'node:crypto';

const base = process.env.STAYHUB_API_URL || 'https://127.0.0.1:18080/api/v1';
const propertyId = process.env.STAYHUB_TEST_PROPERTY_ID;
if (!propertyId) throw new Error('Define STAYHUB_TEST_PROPERTY_ID con una propiedad sintética publicada.');
const offset = Number(process.env.STAYHUB_TEST_CHECKIN_OFFSET || 300);
if (!Number.isSafeInteger(offset) || offset < 1) throw new Error('STAYHUB_TEST_CHECKIN_OFFSET debe ser un entero positivo.');
const api = (path, options) => fetch(`${base}${path}`, options);
async function guest() {
  const email = `concurrency-${randomUUID()}@stayhub.test`;
  const password = `Test-${randomUUID()}`;
  const registered = await api('/auth/register', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify({ name: 'Reserva concurrencia', email, password, role: 'GUEST' }) });
  if (!registered.ok) throw new Error(`Registro de prueba falló: ${registered.status}`);
  for (let i = 0; i < 20; i++) {
    const response = await api('/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    if (response.ok) return (await response.json()).accessToken;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('No se pudo iniciar sesión con la cuenta de prueba.');
}
const response = await api(`/properties/${propertyId}`);
if (!response.ok) throw new Error(`No se pudo consultar la propiedad: ${response.status}`);
const property = await response.json();
const room = property.rooms.find(item => item.basePrice);
if (!room) throw new Error('La propiedad no tiene habitaciones con precio.');
const tokens = await Promise.all([guest(), guest()]);
const date = days => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const body = JSON.stringify({ propertyId, roomId: room.id, checkIn: date(offset), checkOut: date(offset + 2), guests: 1 });
const results = await Promise.all(tokens.map(token => api('/bookings', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': randomUUID() }, body })));
const outcomes = await Promise.all(results.map(async result => ({ status: result.status, body: await result.json() })));
const created = outcomes.filter(result => result.status === 201);
const conflicts = outcomes.filter(result => result.status === 409 && result.body.code === 'BOOKING_CONFLICT');
if (created.length !== 1 || conflicts.length !== 1) throw new Error(`Resultado inesperado: ${outcomes.map(result => `${result.status}:${result.body.code || 'OK'}`).join(', ')}`);
console.log('Dos reservas simultáneas: una creada y una rechazada por conflicto.');
