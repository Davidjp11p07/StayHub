import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadInventoryConfig } from '@inventory/infrastructure/config/inventory-config';

const KEYS = JSON.stringify({ 'gateway-2026-01': '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----' });
const PRIVATE = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } }).privateKey;

function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const base: Record<string, string | undefined> = {
    INVENTORY_DATABASE_URL: 'postgresql://inventory:secret@inventory-db:5432/inventory_db?schema=public',
    INVENTORY_JWT_PUBLIC_KEYS_JSON: KEYS,
    INVENTORY_JWT_ISSUER: 'stayhub-dev-gateway',
    INVENTORY_ACCOMMODATIONS_URL: 'http://accommodations-service:3003',
    INVENTORY_SERVICE_PRIVATE_KEY: PRIVATE,
    INVENTORY_SERVICE_JWT_KID: 'room-inventory-accommodations-2026-01',
    ...overrides,
  };
  return Object.fromEntries(Object.entries(base).filter(([, v]) => v !== undefined)) as NodeJS.ProcessEnv;
}

describe('loadInventoryConfig', () => {
  it('applies safe defaults and freezes the result', () => {
    const config = loadInventoryConfig(env());
    expect(config).toMatchObject({
      port: 3008,
      jwtAudience: 'stayhub-room-inventory-service',
      jwtScope: 'inventory:manage',
      accommodationsUrl: 'http://accommodations-service:3003',
      accommodationsTimeoutMs: 2000,
      accommodationsCircuitFailureThreshold: 5,
      accommodationsCircuitResetMs: 30000,
      outbound: { kid: 'room-inventory-accommodations-2026-01', issuer: 'stayhub-room-inventory-service', audience: 'stayhub-accommodations-service', scope: 'accommodations:inventory-context', ttlSeconds: 60 },
      maxItemsPerRoom: 200,
      maxQuantity: 1_000_000,
      shutdownGraceMs: 10000,
      logLevel: 'info',
    });
    expect(Object.isFrozen(config)).toBe(true);
    expect(config.outbound.privateKey).toContain('BEGIN PRIVATE KEY');
  });

  it.each([
    'INVENTORY_DATABASE_URL', 'INVENTORY_JWT_PUBLIC_KEYS_JSON', 'INVENTORY_JWT_ISSUER',
    'INVENTORY_ACCOMMODATIONS_URL', 'INVENTORY_SERVICE_PRIVATE_KEY', 'INVENTORY_SERVICE_JWT_KID',
  ])('fails closed when %s is missing', (name) => {
    expect(() => loadInventoryConfig(env({ [name]: undefined }))).toThrow(name);
  });

  it('reads secrets from *_FILE and gives the file precedence', () => {
    const dir = mkdtempSync(join(tmpdir(), 'inventory-config-'));
    const dbFile = join(dir, 'db');
    const keyFile = join(dir, 'key.pem');
    writeFileSync(dbFile, 'postgresql://from-file:x@inventory-db:5432/inventory_db\n');
    writeFileSync(keyFile, PRIVATE);
    const config = loadInventoryConfig(env({ INVENTORY_DATABASE_URL_FILE: dbFile, INVENTORY_SERVICE_PRIVATE_KEY: undefined, INVENTORY_SERVICE_PRIVATE_KEY_FILE: keyFile }));
    expect(config.databaseUrl).toBe('postgresql://from-file:x@inventory-db:5432/inventory_db');
    expect(config.outbound.privateKey).toContain('BEGIN PRIVATE KEY');
  });

  it('rejects an unreadable *_FILE without echoing its path content', () => {
    expect(() => loadInventoryConfig(env({ INVENTORY_DATABASE_URL_FILE: join(tmpdir(), 'missing-inventory-db') }))).toThrow('INVENTORY_DATABASE_URL_FILE could not be read');
  });

  it.each([
    ['INVENTORY_PORT', '3011', 'INVENTORY_PORT must be 3008'],
    ['INVENTORY_MAX_ITEMS_PER_ROOM', '201', 'INVENTORY_MAX_ITEMS_PER_ROOM'],
    ['INVENTORY_MAX_ITEMS_PER_ROOM', '0', 'INVENTORY_MAX_ITEMS_PER_ROOM'],
    ['INVENTORY_MAX_QUANTITY', '1000001', 'INVENTORY_MAX_QUANTITY'],
    ['INVENTORY_ACCOMMODATIONS_TIMEOUT_MS', '50', 'INVENTORY_ACCOMMODATIONS_TIMEOUT_MS'],
    ['INVENTORY_ACCOMMODATIONS_TIMEOUT_MS', 'soon', 'INVENTORY_ACCOMMODATIONS_TIMEOUT_MS'],
    ['INVENTORY_SERVICE_TOKEN_TTL_SECONDS', '301', 'INVENTORY_SERVICE_TOKEN_TTL_SECONDS'],
    ['INVENTORY_ACCOMMODATIONS_CIRCUIT_FAILURE_THRESHOLD', '0', 'INVENTORY_ACCOMMODATIONS_CIRCUIT_FAILURE_THRESHOLD'],
    ['INVENTORY_LOG_LEVEL', 'trace', 'INVENTORY_LOG_LEVEL'],
  ])('rejects %s=%s', (name, value, message) => {
    expect(() => loadInventoryConfig(env({ [name]: value }))).toThrow(message);
  });

  it.each([
    ['INVENTORY_DATABASE_URL', 'mysql://u:p@h/inventory_db'],
    ['INVENTORY_ACCOMMODATIONS_URL', 'ftp://accommodations-service'],
    ['INVENTORY_ACCOMMODATIONS_URL', 'not a url'],
  ])('rejects %s with an invalid URL', (name, value) => {
    expect(() => loadInventoryConfig(env({ [name]: value }))).toThrow(name);
  });

  it.each(['[]', '{}', '{"kid":1}', 'nope', '{"kid":"not a pem"}'])('rejects invalid inbound public keys %s', (raw) => {
    expect(() => loadInventoryConfig(env({ INVENTORY_JWT_PUBLIC_KEYS_JSON: raw }))).toThrow('INVENTORY_JWT_PUBLIC_KEYS_JSON');
  });

  it('rejects a private key that is not PKCS#8 PEM', () => {
    expect(() => loadInventoryConfig(env({ INVENTORY_SERVICE_PRIVATE_KEY: 'not-a-key' }))).toThrow('INVENTORY_SERVICE_PRIVATE_KEY');
  });

  it('never includes secret values in error messages', () => {
    expect(() => loadInventoryConfig(env({ INVENTORY_DATABASE_URL: 'mysql://u:super-secret@h/db' }))).toThrow(expect.objectContaining({ message: expect.not.stringContaining('super-secret') }));
  });
});
