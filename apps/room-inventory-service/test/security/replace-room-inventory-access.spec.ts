import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createInventoryTestApp, type InventoryTestApp } from '../fixtures/inventory-app';
import { delegatedToken } from '../fixtures/jwt.fixture';

describe('PUT inventory access and validation', () => {
  let ctx: InventoryTestApp;
  const ownerId = randomUUID();
  beforeAll(async () => { ctx = await createInventoryTestApp(); });
  afterAll(async () => ctx.close());

  it('rejects foreign OWNER, GUEST, duplicate ids and extra fields without mutation', async () => {
    const room = ctx.stub.addRoom(ownerId); const ids = ctx.repository.seedPair(room.roomId, room.propertyId, ownerId);
    const body = { expectedVersion: 1, items: [{ id: ids.first, type: 'PRODUCT', name: 'Agua', quantityAvailable: 1, active: true }] };
    const call = async (token: string, payload: object) => request(ctx.app.getHttpServer()).put(`/inventory/rooms/${room.roomId}`).set('authorization', `Bearer ${token}`).send(payload);
    await call(await delegatedToken({ role: 'OWNER' }), body).then((r) => expect(r.status).toBe(403));
    await call(await delegatedToken({ sub: ownerId, role: 'GUEST' }), body).then((r) => expect(r.status).toBe(403));
    await call(await delegatedToken({ sub: ownerId }), { ...body, items: [body.items[0], body.items[0]] }).then((r) => expect(r.status).toBe(400));
    await call(await delegatedToken({ sub: ownerId }), { ...body, injected: true }).then((r) => expect(r.status).toBe(400));
    await call(await delegatedToken({ sub: ownerId }), { ...body, items: Array.from({ length: 201 }, () => body.items[0]) }).then((r) => expect(r.status).toBe(400));
    expect(ctx.repository.rows.get(room.roomId)?.version).toBe(1);
  });
});
