import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../.artifacts/reports-demo/', import.meta.url));
mkdirSync(root, { recursive: true, mode: 0o700 });
const write = (name, content) => writeFileSync(join(root, name), content, { mode: 0o600 });
const env = (name, values) => write(name, Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n');
if (!existsSync(join(root, 'private.pem'))) {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  write('private.pem', keys.privateKey); write('public.pem', keys.publicKey);
}
chmodSync(join(root, 'public.pem'), 0o644);
const publicKey = readFileSync(join(root, 'public.pem'), 'utf8');
const passwordFile = join(root, 'password');
if (!existsSync(passwordFile)) write('password', randomBytes(24).toString('hex'));
const password = readFileSync(passwordFile, 'utf8');
const issuer = 'stayhub-reports-demo';
const kid = 'reports-demo';
const values = {};
for (const name of ['reports', 'bookings', 'payments', 'accommodations']) {
  const prefix = name.toUpperCase();
  env(`${name}-db.env`, { POSTGRES_DB: `${name}_db`, POSTGRES_USER: `stayhub_${name}`, POSTGRES_PASSWORD: password });
  const base = { NODE_ENV: 'development', OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318', [`${prefix}_DATABASE_URL`]: `postgresql://stayhub_${name}:${password}@${name}-db:5432/${name}_db?schema=public` };
  for (const kind of ['JWT', 'SERVICE_JWT']) Object.assign(base, { [`${prefix}_${kind}_ISSUER`]: issuer, [`${prefix}_${kind}_AUDIENCE`]: `stayhub-${name}-${kind === 'JWT' ? 'access' : 'service'}`, [`${prefix}_${kind}_KID`]: kid, [`${prefix}_${kind}_PUBLIC_KEY_FILE`]: '/run/secrets/source_public' });
  values[name] = base;
}
Object.assign(values.reports, { REPORTS_MODE: 'DEMO' });
for (const [kind, audience] of [['USER', 'stayhub-reports-access'], ['GATEWAY', 'stayhub-reports-service']]) Object.assign(values.reports, { [`REPORTS_${kind}_ISSUER`]: issuer, [`REPORTS_${kind}_AUDIENCE`]: audience, [`REPORTS_${kind}_KID`]: kid, [`REPORTS_${kind}_KEY_FILE`]: '/run/secrets/source_public' });
for (const name of ['bookings', 'payments', 'accommodations']) {
  const prefix = `REPORTS_${name.toUpperCase()}`;
  Object.assign(values.reports, { [`${prefix}_URL`]: `http://${name}-service:${{ bookings: 3005, payments: 3006, accommodations: 3003 }[name]}`, [`${prefix}_ISSUER`]: issuer, [`${prefix}_AUDIENCE`]: `stayhub-${name}-service`, [`${prefix}_KID`]: kid, [`${prefix}_KEY_FILE`]: '/run/secrets/source_private' });
}
Object.assign(values.payments, { PAYMENTS_PORT: 3006, PAYMENTS_ALLOWED_CURRENCIES: 'COP,USD', PAYMENTS_CHARGE_SCOPE: 'payments:charge', PAYMENTS_REFUND_SCOPE: 'payments:refund', PAYMENTS_READ_SCOPE: 'payments:read', PAYMENTS_TOKEN_HMAC_SECRET: password + password });
Object.assign(values.accommodations, { ACCOMMODATIONS_PORT: 3003, ACCOMMODATIONS_BOOKING_QUOTE_SCOPE: 'accommodations:booking-quote', ACCOMMODATIONS_PHOTO_STORAGE_ROOT: '/tmp/reports-demo-photos' });
Object.assign(values.bookings, {
  BOOKINGS_PORT: 3005, BOOKINGS_SERVICE_JWT_PUBLIC_KEYS_JSON: JSON.stringify({ [kid]: publicKey }), BOOKINGS_SERVICE_JWT_SCOPE: 'bookings:invoke',
  BOOKINGS_ACCOMMODATIONS_URL: 'http://accommodations-service:3003', BOOKINGS_PAYMENTS_URL: 'http://payments-service:3006', BOOKINGS_PAYMENT_HOLD_MINUTES: 15,
  BOOKINGS_CANCELLATION_POLICY_VERSION: 'demo-v1', BOOKINGS_RABBITMQ_URL: `amqp://reports:${password}@bookings-rabbitmq:5672`,
  BOOKINGS_RABBITMQ_PAYMENTS_EXCHANGE: 'stayhub.payments', BOOKINGS_WORKER_POLL_INTERVAL_MS: 60000,
});
env('rabbitmq.env', { RABBITMQ_DEFAULT_USER: 'reports', RABBITMQ_DEFAULT_PASS: password });
for (const [name, value] of Object.entries(values)) env(`${name}.env`, value);
console.log('Reports DEMO configuration ready; separate databases and persistent local credentials.');
