import { generateKeyPairSync, randomUUID } from 'node:crypto';

import { importPKCS8, SignJWT } from 'jose';

import type { InventoryConfig } from '@inventory/infrastructure/config/inventory-config';

export const KID = 'gateway-test-2026-01';
export const ISSUER = 'stayhub-test-gateway';
export const AUDIENCE = 'stayhub-room-inventory-service';
export const SCOPE = 'inventory:manage';

const pair = (): { publicKey: string; privateKey: string } => generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

/** Gateway key (inbound delegated JWT), a foreign key, and Inventory's own outbound key. */
export const gatewayKeys = pair();
const foreignKeys = pair();
export const inventoryKeys = pair();

export interface TokenOptions {
  sub?: string;
  role?: string | null;
  scope?: string | null;
  audience?: string;
  issuer?: string;
  kid?: string;
  expiresInSeconds?: number;
  issuedAtOffsetSeconds?: number;
  wrongKey?: boolean;
}

/** Delegated JWT as the Gateway issues it: RS256, kid, iss, aud, sub, role, scope, short expiry. */
export async function delegatedToken(options: TokenOptions = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {};
  if (options.role !== null) claims.role = options.role ?? 'OWNER';
  if (options.scope !== null) claims.scope = options.scope ?? SCOPE;
  const key = await importPKCS8(options.wrongKey ? foreignKeys.privateKey : gatewayKeys.privateKey, 'RS256');
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: options.kid ?? KID, typ: 'JWT' })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setSubject(options.sub ?? randomUUID())
    .setJti(randomUUID())
    .setIssuedAt(now + (options.issuedAtOffsetSeconds ?? 0))
    .setExpirationTime(now + (options.expiresInSeconds ?? 60))
    .sign(key);
}

export function testConfig(overrides: Partial<InventoryConfig> = {}): InventoryConfig {
  return {
    port: 3008,
    databaseUrl: 'postgresql://inventory:x@localhost:5432/inventory_db',
    jwtPublicKeys: { [KID]: gatewayKeys.publicKey },
    jwtIssuer: ISSUER,
    jwtAudience: AUDIENCE,
    jwtScope: SCOPE,
    accommodationsUrl: 'http://127.0.0.1:1',
    accommodationsTimeoutMs: 500,
    accommodationsCircuitFailureThreshold: 3,
    accommodationsCircuitResetMs: 1000,
    outbound: {
      privateKey: inventoryKeys.privateKey,
      kid: 'room-inventory-test-2026-01',
      issuer: 'stayhub-room-inventory-service',
      audience: 'stayhub-accommodations-service',
      scope: 'accommodations:inventory-context',
      ttlSeconds: 60,
    },
    maxItemsPerRoom: 200,
    maxQuantity: 1_000_000,
    shutdownGraceMs: 10000,
    logLevel: 'error',
    otlpEndpoint: 'http://127.0.0.1:4318',
    ...overrides,
  };
}
