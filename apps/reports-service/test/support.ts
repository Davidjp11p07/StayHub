import { generateKeyPairSync } from 'node:crypto';
import { sign } from 'jsonwebtoken';
import type { ReportsConfig } from '../src/infrastructure/config';
export const owner = '11111111-1111-4111-8111-111111111111';
export const other = '22222222-2222-4222-8222-222222222222';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const jwt = { key: keys.publicKey, kid: 'test', issuer: 'test-auth', audience: 'test-api' };
export const config: ReportsConfig = {
  databaseUrl: 'postgresql://test:test@127.0.0.1:5432/reports_db', user: jwt, gateway: { ...jwt, issuer: 'test-gateway', audience: 'test-reports' }, timeoutMs: 1000, mode: 'LIVE',
  targets: Object.fromEntries(['bookings', 'payments', 'accommodations'].map(name => [name, { url: `http://${name}`, jwt: { ...jwt, key: keys.privateKey } }])) as ReportsConfig['targets'],
};
export function token(role = 'OWNER', sub = owner, overrides: Record<string, unknown> = {}, delegated = false): string {
  const now = Math.floor(Date.now() / 1000);
  const settings = delegated ? config.gateway : config.user;
  return sign({ sub, role, iat: now, exp: now + 60, iss: settings.issuer, aud: settings.audience, ...(delegated ? { scope: 'reports:read' } : {}), ...overrides }, keys.privateKey, { algorithm: 'RS256', keyid: 'test' });
}
