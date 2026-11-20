import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { InventoryLogger } from '@inventory/infrastructure/observability/inventory-logger';

import { createInventoryTestApp, type InventoryTestApp } from '../fixtures/inventory-app';
import { delegatedToken, testConfig } from '../fixtures/jwt.fixture';

/** T076: transversal security suite over the three public operations. */
describe('inventory transversal security', () => {
  let ctx: InventoryTestApp;
  let output: string[];
  let stdout: jest.SpyInstance;
  const ownerId = randomUUID();

  beforeAll(async () => {
    ctx = await createInventoryTestApp({ logger: new InventoryLogger(testConfig({ logLevel: 'info' })) });
  });
  afterAll(async () => { await ctx.close(); });
  beforeEach(() => {
    ctx.stub.setGlobal(null);
    ctx.repository.findByRoomId.mockClear();
    output = [];
    stdout = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      output.push(String(chunk));
      return true;
    });
  });
  afterEach(() => stdout.mockRestore());

  const room = (owner = ownerId): string => ctx.stub.addRoom(owner).roomId;
  const auth = async (options: Parameters<typeof delegatedToken>[0] = {}): Promise<string> => `Bearer ${await delegatedToken(options)}`;
  const get = (roomId: string, authorization?: string): request.Test => {
    const req = request(ctx.app.getHttpServer()).get(`/inventory/rooms/${roomId}`);
    return authorization ? req.set('authorization', authorization) : req;
  };
  const add = (roomId: string, body: object, authorization?: string): request.Test => {
    const req = request(ctx.app.getHttpServer()).post(`/inventory/rooms/${roomId}/items`);
    return (authorization ? req.set('authorization', authorization) : req).send(body);
  };

  it.each([
    ['missing bearer', undefined],
    ['malformed token', 'Bearer not-a-token'],
    ['foreign signature', 'Bearer eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJ4In0.invalid'],
  ])('rejects %s with 401 before reading inventory', async (_name, authorization) => {
    const roomId = room();
    await get(roomId, authorization).expect(401);
    await add(roomId, { type: 'PRODUCT', name: 'Agua', quantityAvailable: 1, active: true }, authorization).expect(401);
    expect(ctx.repository.findByRoomId).not.toHaveBeenCalled();
  });

  it.each([
    ['expired', { expiresInSeconds: -30 }],
    ['wrong audience', { audience: 'stayhub-reports-service' }],
    ['wrong scope', { scope: 'bookings:invoke' }],
    ['wrong kid', { kid: 'unknown-kid' }],
    ['wrong key', { wrongKey: true }],
  ])('rejects a delegated token with %s', async (_name, options) => {
    const roomId = room();
    await get(roomId, await auth({ sub: ownerId, role: 'OWNER', ...options })).expect(401);
    expect(ctx.repository.findByRoomId).not.toHaveBeenCalled();
  });

  it('forbids a foreign OWNER and a GUEST without touching local data', async () => {
    const roomId = room();
    await get(roomId, await auth({ role: 'OWNER' })).expect(403);
    await add(roomId, { type: 'PRODUCT', name: 'Agua', quantityAvailable: 1, active: true }, await auth({ sub: ownerId, role: 'GUEST' })).expect(403);
    expect(ctx.repository.findByRoomId).not.toHaveBeenCalled();
  });

  it('ignores spoofed identity headers, even with a valid token', async () => {
    const roomId = room();
    await get(roomId, await auth({ role: 'GUEST', sub: ownerId }))
      .set('x-user-id', ownerId)
      .set('x-role', 'ADMIN')
      .set('x-owner-id', ownerId)
      .expect(403);
    await add(roomId, { type: 'PRODUCT', name: 'Agua', quantityAvailable: 1, active: true })
      .set('x-user-id', ownerId)
      .set('x-role', 'ADMIN')
      .expect(401);
  });

  it('rejects unknown fields instead of persisting them', async () => {
    const roomId = room();
    for (const body of [
      { type: 'PRODUCT', name: 'Agua', quantityAvailable: 1, active: true, $where: { role: 'ADMIN' } },
      { type: 'PRODUCT', name: 'Agua', quantityAvailable: 1, active: true, ownerId: randomUUID() },
    ]) {
      await add(roomId, body, await auth({ sub: ownerId, role: 'OWNER' })).expect(400);
    }
    expect(ctx.repository.rows.has(roomId)).toBe(false);
  });

  it('does not hydrate prototype pollution into the persisted item', async () => {
    const roomId = room();
    const body = JSON.parse('{"type":"PRODUCT","name":"Agua","quantityAvailable":1,"active":true,"__proto__":{"admin":true}}') as object;
    const response = await add(roomId, body, await auth({ sub: ownerId, role: 'OWNER' }));
    expect([201, 400]).toContain(response.status);
    expect(response.body).not.toHaveProperty('admin');
    expect(response.body.items?.[0]).not.toHaveProperty('admin');
    expect(({} as { admin?: boolean }).admin).toBeUndefined();
  });

  it('treats injection-looking names as inert text and keeps them out of logs', async () => {
    const roomId = room();
    const name = "Agua'; DROP TABLE inventory_items; --";
    const response = await add(roomId, { type: 'PRODUCT', name, quantityAvailable: 1, active: true }, await auth({ sub: ownerId, role: 'OWNER' })).expect(201);
    expect(response.body.items[0].name).toBe(name);
    expect(output.join('')).not.toContain(name);
  });

  it('rejects a body above 64 kb with 413 before validation', async () => {
    const roomId = room();
    const response = await add(roomId, { type: 'PRODUCT', name: 'x'.repeat(70_000), quantityAvailable: 1, active: true }, await auth({ sub: ownerId, role: 'OWNER' }));
    expect(response.status).toBe(413);
    expect(ctx.repository.rows.has(roomId)).toBe(false);
  });

  it('fails closed when Accommodations is unavailable: 503, no local inventory exposed', async () => {
    const roomId = room();
    ctx.stub.setGlobal({ kind: 'status', status: 503 });
    const response = await get(roomId, await auth({ sub: ownerId, role: 'OWNER' })).expect(503);
    expect(response.body).not.toHaveProperty('items');
    expect(output.join('')).not.toMatch(/Bearer |eyJ[A-Za-z0-9_-]{8,}/u);
  });
});
