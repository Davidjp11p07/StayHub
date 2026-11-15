import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Deliberately restricted to the isolated Compose project. Never accepts a database URL.
const args = ['compose', '-p', 'stayhub-reports-demo', '-f', 'docker-compose.reports.yml'];
const owner = process.env.REPORTS_DEMO_OWNER_ID ?? '11111111-1111-4111-8111-111111111111';
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(owner)) throw Error('REPORTS_DEMO_OWNER_ID must be UUIDv4');
if (!readFileSync('.artifacts/reports-demo/reports.env', 'utf8').includes('REPORTS_MODE=DEMO')) throw Error('Explicit DEMO configuration required');
const property = '33333333-3333-4333-8333-333333333333';
const room = '44444444-4444-4444-8444-444444444444';
const guest = '55555555-5555-4555-8555-555555555555';
const booking = '66666666-6666-4666-8666-666666666666';
const usdBooking = '77777777-7777-4777-8777-777777777777';
const payment = '88888888-8888-4888-8888-888888888888';
const refund = '99999999-9999-4999-8999-999999999999';
function sql(service, body) {
  const result = spawnSync('docker', [...args, 'exec', '-T', `${service}-db`, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', `stayhub_${service}`, '-d', `${service}_db`], { input: `BEGIN;\n${body}\nCOMMIT;`, encoding: 'utf8' });
  if (result.status !== 0) throw Error(`DEMO seed failed in ${service}: ${result.stderr}`);
}
sql('accommodations', `
INSERT INTO "Property" (id,"ownerId",type,name,"addressLine",city,region,country,status,"updatedAt") VALUES ('${property}','${owner}','HOUSE','Casa de demostración','Dirección sintética','Bogotá','Bogotá','CO','PUBLISHED',NOW()) ON CONFLICT DO NOTHING;
INSERT INTO "Room" (id,"propertyId",name,capacity,"basePriceAmount","basePriceCurrency","updatedAt") VALUES ('${room}','${property}','Habitación de demostración',2,10000,'COP',NOW()) ON CONFLICT DO NOTHING;
INSERT INTO "ReportSupplyVersion" ("propertyId","ownerId",name,"capturedAt","roomIds") SELECT '${property}','${owner}','Casa de demostración','2026-10-01T00:00:00Z','["${room}"]'::jsonb WHERE NOT EXISTS (SELECT 1 FROM "ReportSupplyVersion" WHERE "propertyId"='${property}' AND "capturedAt"='2026-10-01T00:00:00Z');
`);
sql('bookings', `
INSERT INTO bookings (id,"guestId","ownerId","propertyId","roomId","propertyName","roomName","checkIn","checkOut",guests,"capacitySnapshot","nightlyPriceAmount",currency,nights,"totalAmount","accommodationVersion","roomSourceUpdatedAt",status,"paymentStatus","createdAt","updatedAt") VALUES
('${booking}','${guest}','${owner}','${property}','${room}','Casa de demostración','Habitación de demostración','2026-11-03','2026-11-07',1,2,10000,'COP',4,40000,1,'2026-10-01T00:00:00Z','CONFIRMED','CAPTURED','2026-11-02T12:00:00Z',NOW()),
('${usdBooking}','${guest}','${owner}','${property}','${room}','Casa de demostración','Habitación de demostración','2026-11-08','2026-11-09',1,2,10,'USD',1,10,1,'2026-10-01T00:00:00Z','PAYMENT_FAILED','FAILED','2026-11-03T12:00:00Z',NOW()) ON CONFLICT DO NOTHING;
`);
sql('payments', `
INSERT INTO payments (id,booking_id,payer_user_id,amount_minor,currency,status,refunded_amount_minor,payment_method_fingerprint,approved_at) VALUES
('${payment}','${booking}','${guest}',4000000,'COP','PARTIALLY_REFUNDED',1000000,repeat('a',64),'2026-11-02T12:00:00Z'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${usdBooking}','${guest}',1000,'USD','APPROVED',0,repeat('b',64),'2026-11-03T12:00:00Z') ON CONFLICT DO NOTHING;
INSERT INTO refunds (id,payment_id,amount_minor,currency,reason,status) VALUES ('${refund}','${payment}',1000000,'COP','GUEST_CANCELLATION','COMPLETED') ON CONFLICT DO NOTHING;
INSERT INTO refund_status_history (id,refund_id,to_status,reason_code,actor,occurred_at) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','${refund}','COMPLETED','DEMO','reports-demo','2026-11-05T12:00:00Z') ON CONFLICT DO NOTHING;
`);
console.log(`DEMO ready. Owner ${owner}; UTC 2026-11-01 to 2026-11-11: 2 reservations, 40% occupancy; COP charged 4000000/refunded 1000000/net 3000000 minor; USD net 1000 minor.`);
