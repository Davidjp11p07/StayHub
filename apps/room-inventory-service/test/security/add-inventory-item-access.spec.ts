import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { createInventoryTestApp, type InventoryTestApp } from '../fixtures/inventory-app';
import { delegatedToken } from '../fixtures/jwt.fixture';

const valid = { type: 'PRODUCT', name: 'Agua', quantityAvailable: 2, active: true };

describe('POST inventory item access control', () => {
  let ctx: InventoryTestApp;
  const ownerId = randomUUID();

  beforeAll(async () => { ctx = await createInventoryTestApp(); });
  afterAll(async () => ctx.close());
  beforeEach(() => { ctx.stub.setGlobal(null); ctx.repository.addItem.mockClear(); });

  const post = async (roomId: string, token: string, body: object = valid, headers: Record<string, string> = {}): Promise<request.Response> => {
    const call = request(ctx.app.getHttpServer()).post(`/inventory/rooms/${roomId}/items`).set('authorization', `Bearer ${token}`);
    for (const [key, value] of Object.entries(headers)) call.set(key, value);
    return call.send(body);
  };

  it('allows the OWNER and ADMIN', async () => {
    const owned = ctx.stub.addRoom(ownerId);
    await post(owned.roomId, await delegatedToken({ sub: ownerId, role: 'OWNER' })).then((r) => expect(r.status).toBe(201));
    const other = ctx.stub.addRoom(randomUUID());
    await post(other.roomId, await delegatedToken({ role: 'ADMIN' })).then((r) => expect(r.status).toBe(201));
  });

  it.each(['OWNER', 'GUEST'] as const)('rejects unauthorized %s without persisting', async (role) => {
    const room = ctx.stub.addRoom(ownerId);
    const response = await post(room.roomId, await delegatedToken({ role }));
    expect(response.status).toBe(403);
    expect(ctx.repository.addItem).not.toHaveBeenCalled();
  });

  it('ignores spoofed identity headers', async () => {
    const room = ctx.stub.addRoom(ownerId);
    const response = await post(room.roomId, await delegatedToken({ role: 'OWNER' }), valid, { 'x-user-id': ownerId, 'x-role': 'ADMIN' });
    expect(response.status).toBe(403);
  });

  it.each([
    [{ ...valid, unexpected: true }, 'unexpected'],
    [{ ...valid, name: '<script>alert(1)</script>', quantityAvailable: '2' }, 'quantityAvailable'],
    [{ ...valid, name: 'x'.repeat(121) }, 'name'],
  ])('rejects extra or malicious input %#', async (body, field) => {
    const room = ctx.stub.addRoom(ownerId);
    const response = await post(room.roomId, await delegatedToken({ sub: ownerId, role: 'OWNER' }), body);
    expect(response.status).toBe(400);
    expect(response.body.errors).toContainEqual({ field });
    expect(ctx.repository.addItem).not.toHaveBeenCalled();
  });
});
