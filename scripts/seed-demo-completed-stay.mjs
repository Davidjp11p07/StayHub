import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const base = 'http://localhost:5173/api/v1';
const catalog = JSON.parse(await readFile('.artifacts/demo-properties-state.json', 'utf8'));
const file = '.artifacts/demo-completed-stay.json';
const propertyId = catalog.properties['CO-Leticia'].id;
const property = await api('/properties/' + propertyId);
const room = property.rooms.find(row => row.name === 'Habitación principal');
assert.ok(room && property.status === 'PUBLISHED');
const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
try {
  await writeFile(file, JSON.stringify({
    email: 'demo-stay-' + randomUUID() + '@stayhub.test', password: 'Demo-' + randomUUID(),
    registerKey: randomUUID(), bookingKey: randomUUID(),
    stay: { propertyId, roomId: room.id, guests: 1, checkIn: day(0), checkOut: day(1) },
  }), { flag: 'wx', mode: 0o600 });
} catch (error) { if (error.code !== 'EEXIST') throw error; }
const state = JSON.parse(await readFile(file, 'utf8'));
assert.equal(state.stay.propertyId, propertyId);
async function api(path, { token, data, key, method = data ? 'POST' : 'GET' } = {}) {
  const response = await fetch(base + path, { method, headers: {
    ...(token && { authorization: 'Bearer ' + token }), ...(data && { 'content-type': 'application/json' }),
    ...(key && { 'idempotency-key': key }),
  }, body: data ? JSON.stringify(data) : undefined });
  const result = await response.json();
  if (!response.ok) throw Object.assign(Error(method + ' ' + path + ': ' + response.status + ' ' + (result.code ?? '')), { status: response.status });
  return result;
}
const credentials = { email: state.email, password: state.password };
async function login(credentials) { return api('/auth/login', { data: credentials }); }
let session;
try { session = await login(credentials); }
catch (error) {
  if (error.status !== 401) throw error;
  await api('/auth/register', { data: { ...credentials, name: 'Huésped de demostración', role: 'GUEST' }, key: state.registerKey });
  session = await login(credentials);
}
const token = session.accessToken;
const owner = (await login({ email: catalog.email, password: catalog.password })).accessToken;
const history = await api('/bookings?pageSize=100', { token });
assert.ok(history.items.length <= 1 && !history.hasNext, 'Historial inesperado para la cuenta dedicada');
let booking = history.items[0] ?? await api('/bookings', { token, data: state.stay, key: state.bookingKey });
const path = '/bookings/' + booking.id;
for (let i = 0; i < 60; i++) {
  booking = await api(path, { token });
  for (const [key, value] of Object.entries(state.stay)) assert.equal(booking[key], value);
  if (booking.status !== 'PENDING_PAYMENT') break;
  await new Promise(resolve => setTimeout(resolve, 500));
}
assert.equal(booking.paymentStatus, 'CAPTURED');
if (booking.status === 'CONFIRMED') booking = await api(path + '/check-in', { token: owner, method: 'POST' });
if (booking.status === 'CHECKED_IN') booking = await api(path + '/check-out', { token: owner, method: 'POST' });
assert.equal(booking.status, 'COMPLETED');
const comment = 'Reseña ficticia de la estancia de demostración en Leticia.';
const ownReviews = () => api('/reviews/user/' + session.user.userId, { token });
let reviews = await ownReviews();
if (!reviews.total) {
  try { await api('/reviews', { token, data: { bookingId: booking.id, rating: 4, comment } }); }
  catch (error) { if (error.status !== 409) throw error; }
  reviews = await ownReviews();
}
assert.equal(reviews.total, 1);
const review = reviews.items[0];
assert.equal(review.propertyId, propertyId);
assert.equal(review.comment, comment);
assert.equal(review.rating, 4);
let notices;
for (let i = 0; i < 60; i++) {
  notices = (await api('/notifications', { token })).items.filter(item => item.type === 'BOOKING_CONFIRMATION' && item.body.includes(booking.id));
  if (notices.length) break;
  await new Promise(resolve => setTimeout(resolve, 500));
}
assert.equal(notices.length, 1);
console.log(JSON.stringify({ booking: booking.id, guest: session.user.userId, property: propertyId, status: booking.status,
  payment: booking.paymentStatus, total: booking.total, review: review.id, notification: notices[0].id }));
