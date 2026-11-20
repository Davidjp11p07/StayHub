import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { properties } = JSON.parse(readFileSync('.artifacts/demo-properties-state.json', 'utf8'));
function uuidList(ids) {
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
  return ids.length ? ids.map(id => "'" + id + "'").join(',') : 'NULL';
}
function query(service, sql) {
  return execFileSync('docker', ['exec', '-i', 'stayhub-integracion-local-' + service + '-db-1',
    'psql', '-XAtq', '-v', 'ON_ERROR_STOP=1', '-U', 'stayhub_' + service, '-d', service + '_db'],
    { input: 'BEGIN READ ONLY;\n' + sql + ';\nCOMMIT;\n', encoding: 'utf8' }).trim();
}
const ids = Object.values(properties).map(row => row.id);
assert.equal(new Set(ids).size, 37);
assert.equal(ids.length, 37);
const propertyIds = uuidList(ids);
const bookings = query('bookings', 'SELECT id FROM bookings WHERE "propertyId" IN (' + propertyIds + ')').split(/\s+/).filter(Boolean);
const bookingIds = uuidList(bookings);
const count = (service, sql) => {
  const result = query(service, 'SELECT count(*) FROM ' + sql);
  assert.match(result, /^\d+$/);
  return Number(result);
};
const coverage = {
  publishedProperties: count('accommodations', '"Property" WHERE status=\'PUBLISHED\' AND id IN (' + propertyIds + ')'),
  rooms: count('accommodations', '"Room" WHERE "propertyId" IN (' + propertyIds + ')'),
  owners: Number(query('accommodations', 'SELECT count(DISTINCT "ownerId") FROM "Property" WHERE id IN (' + propertyIds + ')')),
  guestsWithBookings: Number(query('bookings', 'SELECT count(DISTINCT "guestId") FROM bookings WHERE id IN (' + bookingIds + ')')),
  bookings: bookings.length,
  bookingStatuses: JSON.parse(query('bookings', 'SELECT coalesce(json_object_agg(status,n),\'{}\') FROM (SELECT status,count(*) n FROM bookings WHERE id IN (' + bookingIds + ') GROUP BY status) s')),
  paymentStatuses: JSON.parse(query('payments', 'SELECT coalesce(json_object_agg(status,n),\'{}\') FROM (SELECT status,count(*) n FROM payments WHERE booking_id IN (' + bookingIds + ') GROUP BY status) s')),
  completed: count('bookings', 'bookings WHERE status=\'COMPLETED\' AND id IN (' + bookingIds + ')'),
  payments: count('payments', 'payments WHERE booking_id IN (' + bookingIds + ')'),
  inventoryItems: count('inventory', 'inventory_items i JOIN room_inventories r ON r.room_id=i.room_id WHERE r.property_id IN (' + propertyIds + ')'),
  reviews: count('reviews', 'reviews WHERE "propertyId" IN (' + propertyIds + ') AND "bookingId" IN (' + bookingIds + ')'),
  confirmations: count('notifications', '"Notification" WHERE type=\'BOOKING_CONFIRMATION\' AND "idempotencyKey" IN (SELECT \'booking-confirmation:\' || id FROM unnest(ARRAY[' + bookingIds + ']::text[]) AS t(id))'),
  propertyReportSnapshots: count('reports', '"ReportSnapshot" WHERE payload->>\'propertyId\' IN (' + propertyIds + ')'),
};
console.log(JSON.stringify(coverage, null, 2));
