import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import request from 'supertest';

import { createInventoryTestApp, type InventoryTestApp } from '../fixtures/inventory-app';
import { delegatedToken } from '../fixtures/jwt.fixture';

const CONTRACT = resolve(__dirname, '../../../../specs/004-inventario-reportes-recomendaciones-cierre/room_inventory_service/contracts/openapi-room-inventory.yaml');

interface Api { components: { schemas: Record<string, object> } }

describe('GET /inventory/rooms/{roomId} contract', () => {
  let ctx: InventoryTestApp;
  let validateInventory: (value: unknown) => boolean;
  let validateProblem: (value: unknown) => boolean;
  const ownerId = randomUUID();

  beforeAll(async () => {
    ctx = await createInventoryTestApp();
    const api = (await SwaggerParser.dereference(CONTRACT)) as unknown as Api;
    const ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv);
    validateInventory = ajv.compile(api.components.schemas.RoomInventory ?? {});
    validateProblem = ajv.compile(api.components.schemas.Problem ?? {});
  });
  afterAll(async () => { await ctx.close(); });
  beforeEach(() => { ctx.stub.setGlobal(null); });

  const get = async (roomId: string, sub = ownerId, role = 'OWNER'): Promise<request.Response> =>
    request(ctx.app.getHttpServer()).get(`/inventory/rooms/${roomId}`).set('authorization', `Bearer ${await delegatedToken({ sub, role })}`);

  it('200 for a room without inventory: version 0, no items, null timestamps', async () => {
    const room = ctx.stub.addRoom(ownerId);
    const response = await get(room.roomId);
    expect(response.status).toBe(200);
    expect(validateInventory(response.body)).toBe(true);
    expect(response.body).toEqual({ roomId: room.roomId, propertyId: room.propertyId, version: 0, items: [], createdAt: null, updatedAt: null });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('200 with persisted items matches #/components/schemas/RoomInventory and exposes no ownerId', async () => {
    const room = ctx.stub.addRoom(ownerId);
    const now = new Date('2031-01-01T10:00:00.000Z');
    ctx.repository.rows.set(room.roomId, {
      roomId: room.roomId, propertyId: room.propertyId, ownerId, version: 2, createdAt: now, updatedAt: now,
      items: [
        { id: randomUUID(), type: 'PRODUCT', name: 'Agua', quantityAvailable: 10, active: true, createdAt: now, updatedAt: now },
        { id: randomUUID(), type: 'SERVICE', name: 'Spa', quantityAvailable: 0, active: false, createdAt: now, updatedAt: now },
      ],
    });
    const response = await get(room.roomId);
    expect(response.status).toBe(200);
    expect(validateInventory(response.body)).toBe(true);
    expect(response.body).toMatchObject({ version: 2, createdAt: '2031-01-01T10:00:00.000Z' });
    expect(response.body.items).toHaveLength(2);
    expect(JSON.stringify(response.body)).not.toContain(ownerId);
  });

  it('400 Problem Details for a non-UUID roomId', async () => {
    const response = await get('not-a-uuid');
    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(validateProblem(response.body)).toBe(true);
    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR', errors: [{ field: 'roomId' }] });
  });

  it('401 Problem Details without a token, carrying the trace id', async () => {
    const response = await request(ctx.app.getHttpServer()).get(`/inventory/rooms/${randomUUID()}`).set('x-request-id', 'trace-inv-00001');
    expect(response.status).toBe(401);
    expect(validateProblem(response.body)).toBe(true);
    expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED', traceId: 'trace-inv-00001' });
  });

  it('403 Problem Details for another owner', async () => {
    const room = ctx.stub.addRoom(randomUUID());
    const response = await get(room.roomId);
    expect(response.status).toBe(403);
    expect(validateProblem(response.body)).toBe(true);
    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('404 Problem Details for a missing or hidden room', async () => {
    const response = await get(randomUUID());
    expect(response.status).toBe(404);
    expect(validateProblem(response.body)).toBe(true);
    expect(response.body.code).toBe('ROOM_NOT_FOUND');
  });

  it('503 Problem Details when Accommodations is down', async () => {
    const room = ctx.stub.addRoom(ownerId);
    ctx.stub.setGlobal({ kind: 'status', status: 503 });
    const response = await get(room.roomId);
    expect(response.status).toBe(503);
    expect(validateProblem(response.body)).toBe(true);
    expect(response.body.code).toBe('DEPENDENCY_UNAVAILABLE');
  });
});
