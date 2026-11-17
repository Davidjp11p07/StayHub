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

describe('POST /inventory/rooms/{roomId}/items contract', () => {
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
  afterAll(async () => ctx.close());
  beforeEach(() => ctx.stub.setGlobal(null));

  const post = async (roomId: string, body: object, sub = ownerId, role = 'OWNER'): Promise<request.Response> =>
    request(ctx.app.getHttpServer()).post(`/inventory/rooms/${roomId}/items`).set('authorization', `Bearer ${await delegatedToken({ sub, role })}`).send(body);

  it('201 creates a normalized item and returns the versioned aggregate', async () => {
    const room = ctx.stub.addRoom(ownerId);
    const response = await post(room.roomId, { type: 'SERVICE', name: '  Desayuno   premium ', quantityAvailable: 0, active: true });
    expect(response.status).toBe(201);
    expect(validateInventory(response.body)).toBe(true);
    expect(response.body).toMatchObject({ roomId: room.roomId, propertyId: room.propertyId, version: 1, items: [{ type: 'SERVICE', name: 'Desayuno premium', quantityAvailable: 0, active: true }] });
    expect(response.body.items[0].id).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it.each([
    [{ type: 'FOOD', name: 'Agua', quantityAvailable: 1, active: true }, 400],
    [{ type: 'PRODUCT', name: '', quantityAvailable: 1, active: true }, 400],
    [{ type: 'PRODUCT', name: 'Agua', quantityAvailable: 1.5, active: true }, 400],
    [{ type: 'PRODUCT', name: 'Agua', quantityAvailable: 1, active: true, price: 2 }, 400],
  ])('rejects a closed or invalid body %#', async (body, status) => {
    const room = ctx.stub.addRoom(ownerId);
    const response = await post(room.roomId, body);
    expect(response.status).toBe(status);
    expect(validateProblem(response.body)).toBe(true);
    expect(ctx.repository.rows.has(room.roomId)).toBe(false);
  });

  it.each([
    ['without token', 401], ['another owner', 403], ['missing room', 404],
  ])('returns a documented Problem Details response: %s', async (scenario, status) => {
    const room = ctx.stub.addRoom(scenario === 'another owner' ? randomUUID() : ownerId);
    const response = scenario === 'without token'
      ? await request(ctx.app.getHttpServer()).post(`/inventory/rooms/${room.roomId}/items`).send({ type: 'PRODUCT', name: 'Agua', quantityAvailable: 1, active: true })
      : await post(scenario === 'missing room' ? randomUUID() : room.roomId, { type: 'PRODUCT', name: 'Agua', quantityAvailable: 1, active: true });
    expect(response.status).toBe(status);
    expect(validateProblem(response.body)).toBe(true);
  });

  it('returns 422 for item 201 and leaves version/items unchanged', async () => {
    const room = ctx.stub.addRoom(ownerId);
    ctx.repository.seedFull(room.roomId, room.propertyId, ownerId);
    const response = await post(room.roomId, { type: 'PRODUCT', name: 'Extra', quantityAvailable: 1, active: true });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('INVENTORY_LIMIT_EXCEEDED');
    expect(ctx.repository.rows.get(room.roomId)).toMatchObject({ version: 1, items: { length: 200 } });
  });

  it('returns 503 when Accommodations is unavailable without writing', async () => {
    const room = ctx.stub.addRoom(ownerId);
    ctx.stub.setGlobal({ kind: 'status', status: 503 });
    const response = await post(room.roomId, { type: 'PRODUCT', name: 'Agua', quantityAvailable: 1, active: true });
    expect(response.status).toBe(503);
    expect(ctx.repository.rows.has(room.roomId)).toBe(false);
  });
});
