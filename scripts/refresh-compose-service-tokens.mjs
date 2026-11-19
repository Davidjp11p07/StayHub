#!/usr/bin/env node
// Development only: refresh existing Compose service credentials without changing signing keys.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { importPKCS8, SignJWT } from 'jose';

const root = resolve(import.meta.dirname, '..');
const secrets = resolve(root, 'secrets');
const bookingsKey = await importPKCS8(readFileSync(resolve(secrets, 'bookings-service-private.pem'), 'utf8'), 'RS256');
const gatewayKey = await importPKCS8(readFileSync(resolve(secrets, 'gateway-private.pem'), 'utf8'), 'RS256');
const issue = (key, kid, issuer, audience, subject, scope) => new SignJWT({ scope })
  .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' }).setIssuer(issuer).setAudience(audience)
  .setSubject(subject).setIssuedAt().setExpirationTime('240s').sign(key);

async function refresh() {
  const booking = (kid, audience, scope) => issue(bookingsKey, kid, 'stayhub-bookings-service', audience, 'bookings-service', scope);
  const tokens = {
    'accommodations-service:accommodations:booking-quote': await booking('bookings-accommodations-2026-01', 'stayhub-accommodations-service', 'accommodations:booking-quote'),
    'payments-service:payments:charge': await booking('bookings-payments-2026-01', 'stayhub-payments-service', 'payments:charge'),
    'payments-service:payments:refund': await booking('bookings-payments-2026-01', 'stayhub-payments-service', 'payments:refund'),
  };
  const notifications = await booking('bookings-notifications-2026-01', 'stayhub-notifications-service', 'notifications:send');
  // Preserve file identity: Compose mounts these individual files into running containers.
  writeFileSync(resolve(secrets, 'bookings-outbound-service-tokens.json'), JSON.stringify(tokens), { mode: 0o600 });
  writeFileSync(resolve(secrets, 'bookings-notifications-service-token.txt'), notifications, { mode: 0o600 });
  // Reviews uses the gateway identity, matching generate-compose-dev-env.mjs.
  const { INBOUND_KID, INBOUND_ISSUER } = await import('./lib/dev-env.mjs');
  const reviews = await issue(gatewayKey, INBOUND_KID, INBOUND_ISSUER, 'stayhub-bookings-service', 'reviews-service', 'reviews:eligibility');
  writeFileSync(resolve(secrets, 'reviews-bookings-service-token.txt'), reviews, { mode: 0o600 });
}

await refresh();
if (!process.argv.includes('--once')) {
  setInterval(() => refresh().catch((error) => { console.error('No se pudieron renovar las credenciales:', error.message); process.exitCode = 1; }), 60_000);
}
