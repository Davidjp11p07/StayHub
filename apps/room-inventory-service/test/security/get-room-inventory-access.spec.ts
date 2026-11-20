import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { createInventoryTestApp, type InventoryTestApp } from '../fixtures/inventory-app';
import { delegatedToken } from '../fixtures/jwt.fixture';

describe('GET /inventory/rooms/{roomId} access control', () => {
  let ctx: InventoryTestApp;
  const ownerId = randomUUID();
  let roomId: string;

  beforeAll(async () => {
    ctx = await createInventoryTestApp();
    roomId = ctx.stub.addRoom(ownerId).roomId;
    const now = new Date();
    ctx.repository.rows.set(roomId, { roomId, propertyId: randomUUID(), ownerId, version: 1, createdAt: now, updatedAt: now, items: [{ id: randomUUID(), type: 'PRODUCT', name: 'Agua', quantityAvailable: 5, active: true, createdAt: now, updatedAt: now }] });
  });
  afterAll(async () => { await ctx.close(); });
  beforeEach(() => { ctx.stub.setGlobal(null); ctx.repository.findByRoomId.mockClear(); });

  const call = (headers: Record<string, string>, id = roomId): request.Test => {
    const req = request(ctx.app.getHttpServer()).get(`/inventory/rooms/${id}`);
    for (const [name, value] of Object.entries(headers)) req.set(name, value);
    return req;
  };

  it('OWNER of the room reads it', async () => {
    const response = await call({ authorization: `Bearer ${await delegatedToken({ sub: ownerId, role: 'OWNER' })}` }).expect(200);
    expect(response.body.items).toHaveLength(1);
  });

  it('OWNER of another room is forbidden and local data is never read', async () => {
    await call({ authorization: `Bearer ${await delegatedToken({ role: 'OWNER' })}` }).expect(403);
    expect(ctx.repository.findByRoomId).not.toHaveBeenCalled();
  });

  it('ADMIN reads any room', async () => {
    await call({ authorization: `Bearer ${await delegatedToken({ role: 'ADMIN' })}` }).expect(200);
  });

  it('GUEST is forbidden even with the owner\'s id', async () => {
    await call({ authorization: `Bearer ${await delegatedToken({ sub: ownerId, role: 'GUEST' })}` }).expect(403);
    expect(ctx.repository.findByRoomId).not.toHaveBeenCalled();
  });

  it('spoofed identity headers cannot impersonate the owner', async () => {
    await call({ authorization: `Bearer ${await delegatedToken({ role: 'OWNER' })}`, 'x-user-id': ownerId, 'x-role': 'ADMIN', 'x-owner-id': ownerId }).expect(403);
  });

  it('identity headers alone never authenticate', async () => {
    await call({ 'x-user-id': ownerId, 'x-role': 'ADMIN' }).expect(401);
  });

  it.each([
    ['expired', { expiresInSeconds: -60 }],
    ['for another audience', { audience: 'stayhub-reports-service' }],
    ['with another scope', { scope: 'bookings:invoke' }],
  ])('rejects a token %s with 401 before contacting Accommodations', async (_name, options) => {
    const before = ctx.stub.requests.length;
    await call({ authorization: `Bearer ${await delegatedToken({ sub: ownerId, role: 'OWNER', ...options })}` }).expect(401);
    expect(ctx.stub.requests.length).toBe(before);
  });

  it('Accommodations down means 503, never local data presented as authorized', async () => {
    ctx.stub.setGlobal({ kind: 'status', status: 500 });
    const response = await call({ authorization: `Bearer ${await delegatedToken({ sub: ownerId, role: 'OWNER' })}` }).expect(503);
    expect(response.body).not.toHaveProperty('items');
    expect(ctx.repository.findByRoomId).not.toHaveBeenCalled();
  });
});
