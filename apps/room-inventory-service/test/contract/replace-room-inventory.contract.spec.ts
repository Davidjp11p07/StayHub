import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { createInventoryTestApp, type InventoryTestApp } from '../fixtures/inventory-app';
import { delegatedToken } from '../fixtures/jwt.fixture';

describe('PUT /inventory/rooms/{roomId} contract', () => {
  let ctx: InventoryTestApp;
  const ownerId = randomUUID();
  beforeAll(async () => { ctx = await createInventoryTestApp(); });
  afterAll(async () => ctx.close());
  beforeEach(() => ctx.stub.setGlobal(null));

  const put = async (roomId: string, body: object, sub = ownerId, role = 'OWNER') =>
    request(ctx.app.getHttpServer()).put(`/inventory/rooms/${roomId}`).set('authorization', `Bearer ${await delegatedToken({ sub, role })}`).send(body);

  it('200 replaces, normalizes and soft-deactivates omitted items', async () => {
    const room = ctx.stub.addRoom(ownerId);
    const ids = ctx.repository.seedPair(room.roomId, room.propertyId, ownerId);
    const response = await put(room.roomId, { expectedVersion: 1, items: [{ id: ids.first, type: 'PRODUCT', name: ' Agua  mineral ', quantityAvailable: 9, active: true }] });
    expect(response.status).toBe(200);
    expect(response.body.version).toBe(2);
    expect(response.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: ids.first, name: 'Agua mineral' }), expect.objectContaining({ id: ids.second, active: false })]));
  });

  it.each([
    [{ expectedVersion: -1, items: [] }, 400],
    [{ expectedVersion: 1, items: Array.from({ length: 201 }, () => ({ id: randomUUID(), type: 'PRODUCT', name: 'x', quantityAvailable: 1, active: true })) }, 400],
    [{ expectedVersion: 1, items: [{ id: randomUUID(), type: 'PRODUCT', name: 'x', quantityAvailable: 1, active: true }] }, 400],
  ])('rejects invalid payload %#', async (body, status) => {
    const room = ctx.stub.addRoom(ownerId);
    const response = await put(room.roomId, body);
    expect(response.status).toBe(status);
  });

  it('returns 409 for a stale divergent state and 200 for replay', async () => {
    const room = ctx.stub.addRoom(ownerId);
    const ids = ctx.repository.seedPair(room.roomId, room.propertyId, ownerId);
    const desired = [{ id: ids.first, type: 'PRODUCT', name: 'Nueva', quantityAvailable: 1, active: true }, { id: ids.second, type: 'SERVICE', name: 'Spa', quantityAvailable: 1, active: true }];
    expect((await put(room.roomId, { expectedVersion: 1, items: desired })).status).toBe(200);
    expect((await put(room.roomId, { expectedVersion: 1, items: desired })).status).toBe(200);
    const conflict = await put(room.roomId, { expectedVersion: 1, items: [{ ...desired[0], name: 'Divergente' }, desired[1]] });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('VERSION_CONFLICT');
  });
});
