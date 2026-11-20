import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { PROPERTY_REPOSITORY, type PropertyRepository } from '../../src/application/ports/property.repository';
import { newProperty } from '../fixtures/accommodations.fixture';
import { inventoryServiceToken, serviceToken } from '../fixtures/config.fixture';
import { postgresHarness, type Harness } from '../integration/postgres.setup';
import { documentedStatuses, expectContract } from './openapi-contract';

const url = process.env.ACCOMMODATIONS_TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

/** T025: provider contract for Room Inventory's authoritative room context. */
describeDb('inventory context provider contract (getRoomInventoryContext)', () => {
  let h: Harness;
  let repo: PropertyRepository;
  const ownerId = randomUUID();

  beforeAll(async () => {
    h = await postgresHarness();
    repo = h.app.get<PropertyRepository>(PROPERTY_REPOSITORY);
  });
  afterAll(async () => { await h?.close(); });
  afterEach(async () => { await h.reset(); });

  async function seed(status: 'DRAFT' | 'PUBLISHED' = 'PUBLISHED'): Promise<{ propertyId: string; roomId: string; otherRoomId: string }> {
    const property = newProperty(ownerId);
    const { id } = await repo.create(property);
    await h.db.property.update({ where: { id }, data: { status } });
    return { propertyId: id, roomId: property.rooms[0]!.id, otherRoomId: property.rooms[1]!.id };
  }

  const get = (roomId: string, authorization?: string): request.Test => {
    const req = request(h.server).get(`/internal/v1/rooms/${roomId}/inventory-context`);
    return authorization === undefined ? req : req.set('Authorization', authorization);
  };

  it('documents the closed route with service auth and the expected statuses', () => {
    expect(documentedStatuses('getRoomInventoryContext').sort()).toEqual([200, 400, 401, 404, 503]);
  });

  it('returns the minimal authoritative context without names, prices or location', async () => {
    const seeded = await seed();
    const response = await get(seeded.roomId, `Bearer ${inventoryServiceToken()}`);
    expectContract(response, 'getRoomInventoryContext');
    expect(response.body).toEqual({
      propertyId: seeded.propertyId,
      roomId: seeded.roomId,
      ownerId,
      propertyStatus: 'PUBLISHED',
      roomExists: true,
    });
    expect(JSON.stringify(response.body)).not.toMatch(/name|price|amount|currency|address|city/iu);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('reports DRAFT/UNPUBLISHED status instead of hiding the authoritative room', async () => {
    const seeded = await seed('DRAFT');
    const response = await get(seeded.roomId, `Bearer ${inventoryServiceToken()}`);
    expectContract(response, 'getRoomInventoryContext');
    expect(response.body).toMatchObject({ roomId: seeded.roomId, propertyStatus: 'DRAFT' });
  });

  it('returns an indistinguishable 404 for unknown rooms', async () => {
    const response = await get(randomUUID(), `Bearer ${inventoryServiceToken()}`);
    expectContract(response, 'getRoomInventoryContext');
    expect(response.status).toBe(404);
    expect(response.body).not.toHaveProperty('propertyId');
  });

  it('returns 400 for a non-UUID room id', async () => {
    const response = await get('not-a-uuid', `Bearer ${inventoryServiceToken()}`);
    expectContract(response, 'getRoomInventoryContext');
    expect(response.status).toBe(400);
  });

  it('rejects missing, expired or malformed service tokens', async () => {
    const seeded = await seed();
    const expired = inventoryServiceToken('stayhub-room-inventory-service', undefined, { exp: Math.floor(Date.now() / 1000) - 10 });
    for (const [roomId, authorization] of [
      [seeded.roomId, undefined],
      [seeded.roomId, 'Bearer not-a-token'],
      [seeded.roomId, `Bearer ${expired}`],
    ] as const) {
      const response = await get(roomId, authorization);
      expectContract(response, 'getRoomInventoryContext');
      expect(response.status).toBe(401);
    }
  });

  it('enforces caller-specific scopes: Booking Quote and Inventory cannot swap scopes or keys', async () => {
    const seeded = await seed();
    const cases = [
      serviceToken('stayhub-bookings-service', 'accommodations:booking-quote'),
      serviceToken('stayhub-bookings-service', 'accommodations:inventory-context'),
      inventoryServiceToken('stayhub-room-inventory-service', 'accommodations:booking-quote'),
    ];
    for (const token of cases) {
      const response = await get(seeded.roomId, `Bearer ${token}`);
      expectContract(response, 'getRoomInventoryContext');
      expect(response.status).toBe(401);
    }
  });
});
