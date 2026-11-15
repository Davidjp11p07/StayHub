import { readFileSync } from 'node:fs';

export type InventoryLogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Outbound service JWT settings (Inventory -> Accommodations). Tokens are signed per call with Inventory's key. */
export interface OutboundServiceJwtConfig {
  readonly privateKey: string;
  readonly kid: string;
  readonly issuer: string;
  readonly audience: string;
  readonly scope: string;
  readonly ttlSeconds: number;
}

export interface InventoryConfig {
  readonly port: 3008;
  readonly databaseUrl: string;
  readonly jwtPublicKeys: Readonly<Record<string, string>>;
  readonly jwtIssuer: string;
  readonly jwtAudience: string;
  readonly jwtScope: string;
  readonly accommodationsUrl: string;
  readonly accommodationsTimeoutMs: number;
  readonly accommodationsCircuitFailureThreshold: number;
  readonly accommodationsCircuitResetMs: number;
  readonly outbound: OutboundServiceJwtConfig;
  readonly maxItemsPerRoom: number;
  readonly maxQuantity: number;
  readonly shutdownGraceMs: number;
  readonly logLevel: InventoryLogLevel;
  readonly otlpEndpoint: string;
}

/** Contract ceilings (openapi-room-inventory.yaml); configuration may only lower them. */
export const CONTRACT_MAX_ITEMS = 200;
export const CONTRACT_MAX_QUANTITY = 1_000_000;

type Env = NodeJS.ProcessEnv;

function required(name: string, value: string | undefined): string {
  if (!value?.trim()) throw new Error(`Missing required configuration: ${name}`);
  return value.trim();
}

/** `${name}_FILE` wins over `${name}` so Docker secrets never coexist with stale plain values. */
function secret(env: Env, name: string): string {
  const file = env[`${name}_FILE`]?.trim();
  if (file) {
    let content: string;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      throw new Error(`${name}_FILE could not be read`);
    }
    return required(name, content);
  }
  return required(name, env[name]);
}

function text(env: Env, name: string, fallback: string): string {
  return env[name]?.trim() || fallback;
}

function integer(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name]?.trim();
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}

function url(name: string, value: string, protocols: readonly string[]): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (!protocols.includes(parsed.protocol)) throw new Error(`${name} must use ${protocols.join(' or ')}`);
  return value.replace(/\/+$/u, '');
}

function publicKeys(name: string, raw: string): Readonly<Record<string, string>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${name} must be valid JSON`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${name} must be an object keyed by kid`);
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0 || !entries.every(([kid, pem]) => kid !== '' && typeof pem === 'string' && pem.includes('BEGIN PUBLIC KEY'))) {
    throw new Error(`${name} must contain at least one SPKI PEM public key`);
  }
  return Object.freeze(Object.fromEntries(entries.map(([kid, pem]) => [kid, (pem as string).replace(/\\n/gu, '\n')])));
}

function privateKey(name: string, raw: string): string {
  const pem = raw.replace(/\\n/gu, '\n');
  if (!pem.includes('-----BEGIN PRIVATE KEY-----') || !pem.includes('-----END PRIVATE KEY-----')) throw new Error(`${name} must be a PKCS#8 PEM private key`);
  return pem;
}

function logLevel(env: Env): InventoryLogLevel {
  const value = text(env, 'INVENTORY_LOG_LEVEL', 'info');
  if (value !== 'debug' && value !== 'info' && value !== 'warn' && value !== 'error') throw new Error('INVENTORY_LOG_LEVEL must be debug, info, warn or error');
  return value;
}

/** Fail-fast loader: any invalid or missing value aborts startup with a message that never includes secrets. */
export function loadInventoryConfig(env: Env = process.env): InventoryConfig {
  const port = integer(env, 'INVENTORY_PORT', 3008, 1, 65535);
  if (port !== 3008) throw new Error('INVENTORY_PORT must be 3008');
  return Object.freeze({
    port,
    databaseUrl: url('INVENTORY_DATABASE_URL', secret(env, 'INVENTORY_DATABASE_URL'), ['postgres:', 'postgresql:']),
    jwtPublicKeys: publicKeys('INVENTORY_JWT_PUBLIC_KEYS_JSON', secret(env, 'INVENTORY_JWT_PUBLIC_KEYS_JSON')),
    jwtIssuer: required('INVENTORY_JWT_ISSUER', env.INVENTORY_JWT_ISSUER),
    jwtAudience: text(env, 'INVENTORY_JWT_AUDIENCE', 'stayhub-room-inventory-service'),
    jwtScope: text(env, 'INVENTORY_JWT_SCOPE', 'inventory:manage'),
    accommodationsUrl: url('INVENTORY_ACCOMMODATIONS_URL', required('INVENTORY_ACCOMMODATIONS_URL', env.INVENTORY_ACCOMMODATIONS_URL), ['http:', 'https:']),
    accommodationsTimeoutMs: integer(env, 'INVENTORY_ACCOMMODATIONS_TIMEOUT_MS', 2000, 100, 30_000),
    accommodationsCircuitFailureThreshold: integer(env, 'INVENTORY_ACCOMMODATIONS_CIRCUIT_FAILURE_THRESHOLD', 5, 1, 100),
    accommodationsCircuitResetMs: integer(env, 'INVENTORY_ACCOMMODATIONS_CIRCUIT_RESET_MS', 30_000, 1000, 600_000),
    outbound: Object.freeze({
      privateKey: privateKey('INVENTORY_SERVICE_PRIVATE_KEY', secret(env, 'INVENTORY_SERVICE_PRIVATE_KEY')),
      kid: required('INVENTORY_SERVICE_JWT_KID', env.INVENTORY_SERVICE_JWT_KID),
      issuer: text(env, 'INVENTORY_SERVICE_JWT_ISSUER', 'stayhub-room-inventory-service'),
      audience: text(env, 'INVENTORY_ACCOMMODATIONS_AUDIENCE', 'stayhub-accommodations-service'),
      scope: text(env, 'INVENTORY_ACCOMMODATIONS_SCOPE', 'accommodations:inventory-context'),
      // Accommodations rejects tokens older than 300 s, so the TTL can never exceed it.
      ttlSeconds: integer(env, 'INVENTORY_SERVICE_TOKEN_TTL_SECONDS', 60, 5, 300),
    }),
    maxItemsPerRoom: integer(env, 'INVENTORY_MAX_ITEMS_PER_ROOM', CONTRACT_MAX_ITEMS, 1, CONTRACT_MAX_ITEMS),
    maxQuantity: integer(env, 'INVENTORY_MAX_QUANTITY', CONTRACT_MAX_QUANTITY, 1, CONTRACT_MAX_QUANTITY),
    shutdownGraceMs: integer(env, 'INVENTORY_SHUTDOWN_GRACE_MS', 10_000, 1000, 120_000),
    logLevel: logLevel(env),
    otlpEndpoint: url('OTEL_EXPORTER_OTLP_ENDPOINT', text(env, 'OTEL_EXPORTER_OTLP_ENDPOINT', 'http://otel-collector:4318'), ['http:', 'https:']),
  });
}
