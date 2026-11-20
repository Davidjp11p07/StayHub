import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv, ACCESS_KID, INBOUND_KID, INBOUND_ISSUER } from './lib/dev-env.mjs';

// Reads existing platform configuration; does not rotate or rewrite any existing service credentials.
const project = join(import.meta.dirname, '..');
const input = Object.fromEntries(parseEnv(readFileSync(join(project, '.env'), 'utf8')));
const root = join(project, '.artifacts', 'reports-live');
mkdirSync(root, { recursive: true, mode: 0o700 });
const write = (name, value) => writeFileSync(join(root, name), value, { mode: 0o600 });
const env = (name, values) => write(name, Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n');
if (!existsSync(join(root, 'source-private.pem'))) {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  write('source-private.pem', pair.privateKey); write('source-public.pem', pair.publicKey);
}
if (!existsSync(join(root, 'password'))) write('password', randomBytes(24).toString('hex'));
const password = readFileSync(join(root, 'password'), 'utf8').trim();
write('user-public.pem', readFileSync(join(project, 'secrets/access-public.pem'), 'utf8'));
write('gateway-public.pem', readFileSync(join(project, 'secrets/gateway-public.pem'), 'utf8'));
env('reports-db.env', { POSTGRES_DB: 'reports_db', POSTGRES_USER: 'stayhub_reports', POSTGRES_PASSWORD: password });
const values = { NODE_ENV: 'development', REPORTS_MODE: 'LIVE', REPORTS_DATABASE_URL: `postgresql://stayhub_reports:${password}@reports-db:5432/reports_db?schema=public` };
Object.assign(values, {
  REPORTS_USER_ISSUER: input.AUTH_JWT_ISSUER ?? 'https://auth.stayhub.internal', REPORTS_USER_AUDIENCE: input.AUTH_JWT_AUDIENCE ?? 'stayhub-api', REPORTS_USER_KID: input.AUTH_JWT_KID ?? ACCESS_KID, REPORTS_USER_KEY_FILE: '/run/secrets/reports_user_public',
  REPORTS_GATEWAY_ISSUER: input.GATEWAY_SERVICE_ISSUER ?? INBOUND_ISSUER, REPORTS_GATEWAY_AUDIENCE: 'stayhub-reports-service', REPORTS_GATEWAY_KID: input.GATEWAY_SERVICE_KID ?? INBOUND_KID, REPORTS_GATEWAY_KEY_FILE: '/run/secrets/reports_gateway_public',
});
for (const [name, port] of [['BOOKINGS', 3005], ['PAYMENTS', 3006], ['ACCOMMODATIONS', 3003]]) Object.assign(values, {
  [`REPORTS_${name}_URL`]: `http://${name.toLowerCase()}-service:${port}`, [`REPORTS_${name}_ISSUER`]: 'stayhub-reports-service', [`REPORTS_${name}_AUDIENCE`]: input[`${name}_SERVICE_JWT_AUDIENCE`] ?? `stayhub-${name.toLowerCase()}-service`, [`REPORTS_${name}_KID`]: 'reports-v1', [`REPORTS_${name}_KEY_FILE`]: '/run/secrets/reports_source_private',
});
env('reports.env', values);
console.log('Reports LIVE configuration ready; dedicated read-only source signer and existing platform identities.');
