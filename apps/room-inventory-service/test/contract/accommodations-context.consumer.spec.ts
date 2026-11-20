import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { importSPKI, jwtVerify } from 'jose';

import { InventoryError } from '@inventory/domain/inventory-errors';
import { AccommodationsRoomContextClient } from '@inventory/infrastructure/http/accommodations-room-context.client';
import { OutboundServiceTokenProvider } from '@inventory/infrastructure/security/outbound-service-token.provider';

import { startAccommodationsStub, type AccommodationsStub } from '../fixtures/accommodations-context.fixture';
import { inventoryKeys, testConfig } from '../fixtures/jwt.fixture';

const CONTRACT = resolve(__dirname, '../../../../specs/004-inventario-reportes-recomendaciones-cierre/room_inventory_service/contracts/accommodations-inventory-context.openapi.yaml');

interface Api { paths: Record<string, Record<string, { operationId?: string; responses: Record<string, unknown> }>>; components: { schemas: Record<string, object> } }

async function codeOf(action: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await action();
  } catch (error) {
    if (error instanceof InventoryError) return error.code;
    throw error;
  }
  return undefined;
}

describe('Accommodations inventory-context consumer contract', () => {
  let stub: AccommodationsStub;
  let api: Api;
  let validateContext: (value: unknown) => boolean;
  const ownerId = randomUUID();

  const client = (overrides: Parameters<typeof testConfig>[0] = {}, now?: () => number): AccommodationsRoomContextClient => {
    const config = testConfig({ accommodationsUrl: stub.url, ...overrides });
    return new AccommodationsRoomContextClient(config, new OutboundServiceTokenProvider(config), undefined, now);
  };

  beforeAll(async () => {
    stub = await startAccommodationsStub();
    api = (await SwaggerParser.dereference(CONTRACT)) as unknown as Api;
    const ajv = new Ajv({ strict: false });
    addFormats(ajv);
    validateContext = ajv.compile(api.components.schemas.RoomInventoryContext ?? {});
  });

  afterAll(async () => { await stub.close(); });
  beforeEach(() => { stub.setGlobal(null); stub.requests.length = 0; });

  it('the provider contract declares GET /internal/v1/rooms/{roomId}/inventory-context with 200/400/401/404/503', () => {
    const operation = api.paths['/internal/v1/rooms/{roomId}/inventory-context']?.get;
    expect(operation?.operationId).toBe('getRoomInventoryContext');
    expect(Object.keys(operation?.responses ?? {}).sort()).toEqual(['200', '400', '401', '404', '503']);
  });

  it('the stub answers with bodies that satisfy the provider schema (closed: additionalProperties false)', () => {
    const body = stub.addRoom(ownerId);
    expect(validateContext(body)).toBe(true);
    expect(validateContext({ ...body, propertyName: 'leak' })).toBe(false);
  });

  it('maps a 200 to the minimal context and calls the documented path with a service JWT and x-request-id', async () => {
    const room = stub.addRoom(ownerId, { propertyStatus: 'DRAFT' });
    await expect(client().getContext(room.roomId, 'trace-ctx-0001')).resolves.toEqual({ roomId: room.roomId, propertyId: room.propertyId, ownerId, propertyStatus: 'DRAFT' });
    const call = stub.requests[0];
    expect(call).toMatchObject({ method: 'GET', path: `/internal/v1/rooms/${room.roomId}/inventory-context`, requestId: 'trace-ctx-0001' });
    const token = call?.authorization?.replace(/^Bearer /u, '') ?? '';
    const { payload } = await jwtVerify(token, await importSPKI(inventoryKeys.publicKey, 'RS256'), { audience: 'stayhub-accommodations-service', issuer: 'stayhub-room-inventory-service' });
    expect(payload.scope).toBe('accommodations:inventory-context');
  });

  it('maps 404 (missing or hidden: indistinguishable) to ROOM_NOT_FOUND', async () => {
    await expect(codeOf(() => client().getContext(randomUUID(), 'trace-ctx-0002'))).resolves.toBe('ROOM_NOT_FOUND');
  });

  it.each([400, 401, 403, 500, 503] as const)('maps %i to DEPENDENCY_UNAVAILABLE (never to a client error or local data)', async (status) => {
    const room = stub.addRoom(ownerId);
    stub.setBehaviour(room.roomId, { kind: 'status', status });
    await expect(codeOf(() => client().getContext(room.roomId, 'trace-ctx-0003'))).resolves.toBe('DEPENDENCY_UNAVAILABLE');
  });

  it.each([
    ['non-JSON', 'not json'],
    ['an extra field', JSON.stringify({ roomId: '', propertyId: randomUUID(), ownerId: randomUUID(), propertyStatus: 'PUBLISHED', roomExists: true, propertyName: 'x' })],
    ['roomExists=false', JSON.stringify({ roomId: '', propertyId: randomUUID(), ownerId: randomUUID(), propertyStatus: 'PUBLISHED', roomExists: false })],
    ['an unknown status', JSON.stringify({ roomId: '', propertyId: randomUUID(), ownerId: randomUUID(), propertyStatus: 'ARCHIVED', roomExists: true })],
    ['a non-UUID owner', JSON.stringify({ roomId: '', propertyId: randomUUID(), ownerId: 'owner-1', propertyStatus: 'PUBLISHED', roomExists: true })],
  ])('rejects a 200 with %s as DEPENDENCY_UNAVAILABLE', async (_name, raw) => {
    const roomId = randomUUID();
    stub.setBehaviour(roomId, { kind: 'raw', status: 200, body: raw.replace('"roomId":""', `"roomId":"${roomId}"`) });
    await expect(codeOf(() => client().getContext(roomId, 'trace-ctx-0004'))).resolves.toBe('DEPENDENCY_UNAVAILABLE');
  });

  it('rejects a context for a different room', async () => {
    const room = stub.addRoom(ownerId);
    const other = randomUUID();
    stub.setBehaviour(other, { kind: 'ok', body: room });
    await expect(codeOf(() => client().getContext(other, 'trace-ctx-0005'))).resolves.toBe('DEPENDENCY_UNAVAILABLE');
  });

  it('times out slow responses as DEPENDENCY_UNAVAILABLE', async () => {
    const room = stub.addRoom(ownerId);
    stub.setBehaviour(room.roomId, { kind: 'slow', delayMs: 1500, body: room });
    const started = Date.now();
    await expect(codeOf(() => client({ accommodationsTimeoutMs: 200 }).getContext(room.roomId, 'trace-ctx-0006'))).resolves.toBe('DEPENDENCY_UNAVAILABLE');
    expect(Date.now() - started).toBeLessThan(1200);
  });

  it('opens the circuit after the failure threshold, fails fast, and half-opens after the reset window', async () => {
    let clock = 1_000_000;
    const breaker = client({ accommodationsCircuitFailureThreshold: 2, accommodationsCircuitResetMs: 5000 }, () => clock);
    const room = stub.addRoom(ownerId);
    stub.setGlobal({ kind: 'status', status: 503 });
    await codeOf(() => breaker.getContext(room.roomId, 'trace-ctx-0007'));
    await codeOf(() => breaker.getContext(room.roomId, 'trace-ctx-0007'));
    expect(breaker.health()).toBe('down');
    const before = stub.requests.length;
    await expect(codeOf(() => breaker.getContext(room.roomId, 'trace-ctx-0007'))).resolves.toBe('DEPENDENCY_UNAVAILABLE');
    expect(stub.requests.length).toBe(before);
    stub.setGlobal(null);
    clock += 5001;
    await expect(breaker.getContext(room.roomId, 'trace-ctx-0007')).resolves.toMatchObject({ roomId: room.roomId });
    expect(breaker.health()).toBe('up');
  });

  it('reports unknown health before the first call and keeps 404 out of the failure count', async () => {
    const fresh = client({ accommodationsCircuitFailureThreshold: 1 });
    expect(fresh.health()).toBe('unknown');
    await codeOf(() => fresh.getContext(randomUUID(), 'trace-ctx-0008'));
    expect(fresh.health()).toBe('up');
  });

  it('fails as DEPENDENCY_UNAVAILABLE when Accommodations cannot be reached at all', async () => {
    await expect(codeOf(() => client({ accommodationsUrl: 'http://127.0.0.1:1' }).getContext(randomUUID(), 'trace-ctx-0009'))).resolves.toBe('DEPENDENCY_UNAVAILABLE');
  });
});
