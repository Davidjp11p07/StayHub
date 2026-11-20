import { BadRequestException, HttpException } from '@nestjs/common';
import type { Request } from 'express';
import { importSPKI, jwtVerify } from 'jose';

import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';
import { RoomInventoryClient, type InventoryRequestContext } from '@gateway/infrastructure/http/room-inventory.client';
import { InventoryController } from '@gateway/modules/inventory/inventory.controller';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

const ROOM_ID = '00000000-0000-4000-8000-000000000123';
const USER_ID = '00000000-0000-4000-8000-000000000999';

interface Captured {
  readonly url: string;
  readonly init?: RequestInit;
}

function clientWith(
  fixture: ReturnType<typeof createTestGatewayConfig>,
  responses: Array<() => Promise<Response>>,
): { client: RoomInventoryClient; calls: Captured[] } {
  const calls: Captured[] = [];
  const client = new RoomInventoryClient(fixture.config, {
    fetch: ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      calls.push({ url, ...(init === undefined ? {} : { init }) });
      const next = responses[Math.min(calls.length - 1, responses.length - 1)];
      return next ? next() : Promise.reject(new Error('no response'));
    }) as typeof fetch,
    sleep: (): Promise<void> => Promise.resolve(),
  });
  return { client, calls };
}

const json = (status: number, body: unknown): Promise<Response> =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

const problem = (status: number, code: string): Promise<Response> =>
  Promise.resolve(new Response(JSON.stringify({ type: 'about:blank', title: 'error', status, code, traceId: 'remote' }), {
    status, headers: { 'content-type': 'application/problem+json' },
  }));

/** T070: Gateway -> Room Inventory proxy: routes, delegated service JWT, body/header allowlist and failures. */
describe('Gateway -> Room Inventory proxy', () => {
  const context: InventoryRequestContext = { traceId: 'trace-inventory-1', userId: USER_ID, role: 'OWNER' };

  it('GET forwards only the room path, trace and a short delegated JWT with sub/role/scope', async () => {
    const fixture = createTestGatewayConfig();
    const { client, calls } = clientWith(fixture, [(): Promise<Response> => json(200, { roomId: ROOM_ID, version: 0, items: [] })]);
    await expect(client.getRoomInventory(ROOM_ID, context)).resolves.toMatchObject({ roomId: ROOM_ID, version: 0 });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`http://room-inventory-service:3008/inventory/rooms/${ROOM_ID}`);
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get('x-request-id')).toBe('trace-inventory-1');
    expect(headers.get('x-user-id')).toBeNull();
    expect(headers.get('x-role')).toBeNull();
    const authorization = headers.get('authorization');
    expect(authorization).toMatch(/^Bearer /u);
    const key = await importSPKI(fixture.servicePublicKeyPem, 'RS256');
    const verified = await jwtVerify(authorization!.slice(7), key, {
      issuer: fixture.config.serviceJwt.issuer,
      audience: fixture.config.inventoryServiceJwt.audience,
    });
    expect(verified.payload).toMatchObject({ sub: USER_ID, role: 'OWNER', scope: 'inventory:manage' });
    expect(verified.protectedHeader.kid).toBe(fixture.config.serviceJwt.kid);
    expect(Number(verified.payload.exp) - Number(verified.payload.iat)).toBeLessThanOrEqual(300);
  });

  it('POST forwards a closed JSON body unchanged and returns 201', async () => {
    const fixture = createTestGatewayConfig();
    const { client, calls } = clientWith(fixture, [(): Promise<Response> => json(201, { roomId: ROOM_ID, version: 1, items: [{ name: 'Agua' }] })]);
    const body = { type: 'PRODUCT', name: 'Agua', quantityAvailable: 2, active: true };
    await expect(client.addItem(ROOM_ID, body, context)).resolves.toMatchObject({ version: 1 });

    expect(calls[0]?.url).toBe(`http://room-inventory-service:3008/inventory/rooms/${ROOM_ID}/items`);
    expect(calls[0]?.init?.method).toBe('POST');
    expect(new Headers(calls[0]?.init?.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(new TextDecoder().decode(calls[0]?.init?.body as Uint8Array))).toEqual(body);
  });

  it('PUT forwards expectedVersion/items and preserves a remote 409 Problem Details', async () => {
    const fixture = createTestGatewayConfig();
    const { client, calls } = clientWith(fixture, [(): Promise<Response> => problem(409, 'VERSION_CONFLICT')]);
    const body = { expectedVersion: 3, items: [{ id: '00000000-0000-4000-8000-000000000111', type: 'PRODUCT', name: 'Agua', quantityAvailable: 1, active: true }] };

    const error = await client.replace(ROOM_ID, body, context).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(409);
    expect((error as HttpException).getResponse()).toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(calls[0]?.url).toBe(`http://room-inventory-service:3008/inventory/rooms/${ROOM_ID}`);
    expect(calls[0]?.init?.method).toBe('PUT');
    expect(JSON.parse(new TextDecoder().decode(calls[0]?.init?.body as Uint8Array))).toEqual(body);
  });

  it('the controller validates the room UUID and forwards sub/role without touching ownership', async () => {
    const invocations: Array<{ method: string; roomId: string; body?: unknown; context: InventoryRequestContext }> = [];
    const fake = {
      getRoomInventory: (roomId: string, context: InventoryRequestContext) => { invocations.push({ method: 'get', roomId, context }); return Promise.resolve({}); },
      addItem: (roomId: string, body: unknown, context: InventoryRequestContext) => { invocations.push({ method: 'add', roomId, body, context }); return Promise.resolve({}); },
      replace: (roomId: string, body: unknown, context: InventoryRequestContext) => { invocations.push({ method: 'replace', roomId, body, context }); return Promise.resolve({}); },
    } as unknown as RoomInventoryClient;
    const controller = new InventoryController(fake);
    const request = { user: { userId: USER_ID, role: 'ADMIN' }, header: (): string => 'trace-controller' } as unknown as Request;

    await controller.get(ROOM_ID, request);
    await controller.add(ROOM_ID, { type: 'PRODUCT' }, request);
    await controller.replace(ROOM_ID, { expectedVersion: 0, items: [] }, request);
    expect(invocations).toEqual([
      { method: 'get', roomId: ROOM_ID, context: { traceId: 'trace-controller', userId: USER_ID, role: 'ADMIN' } },
      { method: 'add', roomId: ROOM_ID, body: { type: 'PRODUCT' }, context: { traceId: 'trace-controller', userId: USER_ID, role: 'ADMIN' } },
      { method: 'replace', roomId: ROOM_ID, body: { expectedVersion: 0, items: [] }, context: { traceId: 'trace-controller', userId: USER_ID, role: 'ADMIN' } },
    ]);
    expect(() => controller.get('not-a-uuid', request)).toThrow(BadRequestException);
  });

  it('opens the circuit on transport failure without retrying forever', async () => {
    const fixture = createTestGatewayConfig({ GATEWAY_INVENTORY_CIRCUIT_FAILURE_THRESHOLD: '1' });
    const { client, calls } = clientWith(fixture, [(): Promise<Response> => Promise.reject(new Error('timeout'))]);
    await expect(client.getRoomInventory(ROOM_ID, context)).rejects.toBeInstanceOf(GatewayDependencyError);
    await expect(client.getRoomInventory(ROOM_ID, context)).rejects.toBeInstanceOf(GatewayDependencyError);
    expect(calls).toHaveLength(1);
  });

  it('does not retry POST when the transport fails', async () => {
    const fixture = createTestGatewayConfig({ GATEWAY_INVENTORY_CIRCUIT_FAILURE_THRESHOLD: '10' });
    const { client, calls } = clientWith(fixture, [(): Promise<Response> => Promise.reject(new Error('timeout'))]);
    await expect(client.addItem(ROOM_ID, { type: 'PRODUCT', name: 'Agua', quantityAvailable: 1, active: true }, context))
      .rejects.toBeInstanceOf(GatewayDependencyError);
    expect(calls).toHaveLength(1);
  });
});
