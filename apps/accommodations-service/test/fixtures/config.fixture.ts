import { createHmac, createSign, generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sign, type SignOptions } from 'jsonwebtoken';
import type { AccommodationsConfig } from '../../src/infrastructure/config/accommodations-config';

export const accessKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const foreignKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const inventoryServiceKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
export const publicKeyPem = accessKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
export const TEST_ISSUER = 'test-auth';
export const TEST_AUDIENCE = 'test-api';
export const TEST_KID = 'access-v1';
export const SERVICE_ISSUER = 'test-bookings';
export const SERVICE_AUDIENCE = 'test-accommodations-service';
export const SERVICE_KID = 'service-v1';
export const SERVICE_SCOPE = 'accommodations:booking-quote';
export const INVENTORY_SERVICE_ISSUER = 'test-room-inventory';
export const INVENTORY_SERVICE_KID = 'inventory-service-v1';
export const INVENTORY_SCOPE = 'accommodations:inventory-context';
export const SYNTHETIC_DATABASE_URL = 'postgresql://accommodations:synthetic@localhost:5432/accommodations_db';

export function storageRoot(): string {
  return mkdtempSync(join(tmpdir(), 'accommodations-photos-'));
}

export function testConfig(databaseUrl = SYNTHETIC_DATABASE_URL, photoStorageRoot = storageRoot()): AccommodationsConfig {
  return {
    port: 3003, databaseUrl, photoStorageRoot, otlpEndpoint: 'http://localhost:4318', development: false,
    jwt: { issuer: TEST_ISSUER, audience: TEST_AUDIENCE, kid: TEST_KID, publicKey: publicKeyPem },
    serviceJwt: { issuer: SERVICE_ISSUER, audience: SERVICE_AUDIENCE, kid: SERVICE_KID, publicKey: publicKeyPem, scope: SERVICE_SCOPE },
    serviceJwtCallers: [
      { issuer: SERVICE_ISSUER, kid: SERVICE_KID, publicKey: publicKeyPem, scopes: [SERVICE_SCOPE] },
      { issuer: INVENTORY_SERVICE_ISSUER, kid: INVENTORY_SERVICE_KID, publicKey: inventoryServiceKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString(), scopes: [INVENTORY_SCOPE] },
    ],
  };
}

export type Role = 'GUEST' | 'OWNER' | 'ADMIN';

export function token(sub: string = randomUUID(), role: Role = 'OWNER', claims: Record<string, unknown> = {}, options: SignOptions = {}): string {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub, role, iss: TEST_ISSUER, aud: TEST_AUDIENCE, iat: now, exp: now + 3600, ...claims }, accessKeys.privateKey, { algorithm: 'RS256', keyid: TEST_KID, ...options });
}

export function bearer(sub?: string, role: Role = 'OWNER'): string {
  return `Bearer ${token(sub, role)}`;
}

export function serviceToken(sub: string = 'stayhub-bookings-service', scope: string = SERVICE_SCOPE, claims: Record<string, unknown> = {}, options: SignOptions = {}): string {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub, scope, iss: SERVICE_ISSUER, aud: SERVICE_AUDIENCE, iat: now, exp: now + 240, ...claims }, accessKeys.privateKey, { algorithm: 'RS256', keyid: SERVICE_KID, ...options });
}

/** Inventory signs with its own key and issuer; Booking Quote must not accept it. */
export function inventoryServiceToken(sub: string = 'stayhub-room-inventory-service', scope: string = INVENTORY_SCOPE, claims: Record<string, unknown> = {}, options: SignOptions = {}): string {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub, scope, iss: INVENTORY_SERVICE_ISSUER, aud: SERVICE_AUDIENCE, iat: now, exp: now + 240, ...claims }, inventoryServiceKeys.privateKey, { algorithm: 'RS256', keyid: INVENTORY_SERVICE_KID, ...options });
}

const base64url = (value: unknown): string => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

/** Builds a compact JWS byte by byte so adversarial headers/claims are not normalised by a library. */
export function forgeToken(header: Record<string, unknown>, payload: Record<string, unknown>, signer: 'rs256' | 'none' | 'hs256-public-key' | 'foreign-key' = 'rs256'): string {
  const input = `${base64url(header)}.${base64url(payload)}`;
  if (signer === 'none') return `${input}.`;
  if (signer === 'hs256-public-key') return `${input}.${createHmac('sha256', publicKeyPem).update(input).digest('base64url')}`;
  const key = signer === 'foreign-key' ? foreignKeys.privateKey : accessKeys.privateKey;
  return `${input}.${createSign('RSA-SHA256').update(input).sign(key).toString('base64url')}`;
}

export function validClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return { sub: randomUUID(), role: 'OWNER', iss: TEST_ISSUER, aud: TEST_AUDIENCE, iat: now, exp: now + 3600, ...overrides };
}

export const validHeader = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({ alg: 'RS256', typ: 'JWT', kid: TEST_KID, ...overrides });
