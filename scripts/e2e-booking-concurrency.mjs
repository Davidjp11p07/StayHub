import { randomUUID } from 'node:crypto';

const base = process.env.STAYHUB_API_URL || 'https://127.0.0.1:18080/api/v1';
const propertyId = process.env.STAYHUB_TEST_PROPERTY_ID;
if (!propertyId) throw new Error('Define STAYHUB_TEST_PROPERTY_ID con una propiedad sintética publicada.');
const offset = Number(process.env.STAYHUB_TEST_CHECKIN_OFFSET || 300);
if (!Number.isSafeInteger(offset) || offset < 1) throw new Error('STAYHUB_TEST_CHECKIN_OFFSET debe ser un entero positivo.');
const attempts = Number(process.env.STAYHUB_TEST_BOOKING_ATTEMPTS || 2);
if (!Number.isSafeInteger(attempts) || attempts < 2 || attempts > 20) {
  throw new Error('STAYHUB_TEST_BOOKING_ATTEMPTS debe ser un entero entre 2 y 20.');
}
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
async function reserve(token) {
  const response = await api('/bookings', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
    body,
  });
  return { status: response.status, booking: await response.json(), token };
}
async function cancel(result) {
  const response = await api(`/bookings/${result.booking.id}`, {
    method: 'DELETE', headers: { authorization: `Bearer ${result.token}` },
  });
  if (!response.ok || (await response.json()).status !== 'CANCELLED_BY_GUEST') {
    throw new Error(`Cancelación de la reserva sintética ${result.booking.id} falló: ${response.status}`);
  }
}
const requests = await Promise.allSettled(Array.from({ length: attempts }, (_, index) => reserve(tokens[index % tokens.length])));
const outcomes = requests.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
const created = outcomes.filter(result => result.status === 201);
try {
  const conflicts = outcomes.filter(result => result.status === 409 && result.booking.code === 'BOOKING_CONFLICT');
  if (created.length !== 1 || conflicts.length !== attempts - 1) {
    throw new Error(`Resultado inesperado: ${outcomes.map(result => `${result.status}:${result.booking.code || 'OK'}`).join(', ')}. Sin respuesta: ${attempts - outcomes.length}`);
  }
  console.log(`${attempts} intentos simultáneos: una reserva creada y ${conflicts.length} conflictos.`);
} finally {
  for (const result of created) await cancel(result);
}
const nextGuest = tokens.find(token => token !== created[0].token);
const next = await reserve(nextGuest);
if (next.status !== 201) throw new Error(`La habitación no se pudo volver a reservar: ${next.status}`);
await cancel(next);
console.log('Otra persona pudo reservar las mismas fechas después de la cancelación. Ambas reservas de prueba quedaron canceladas.');
