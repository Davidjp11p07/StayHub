import { randomUUID } from 'node:crypto';

import { GetRoomInventoryUseCase } from '@inventory/application/use-cases/get-room-inventory.use-case';
import { PrismaInventoryRepository } from '@inventory/infrastructure/persistence/prisma/prisma-inventory.repository';
import { PrismaService } from '@inventory/infrastructure/persistence/prisma/prisma.service';

const url = process.env.INVENTORY_TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

describeDb('room inventory read on PostgreSQL 16', () => {
  const prisma = new PrismaService({ datasources: { db: { url: url ?? '' } } });
  const repository = new PrismaInventoryRepository(prisma);
  const roomId = randomUUID();
  const emptyRoomId = randomUUID();
  const ownerId = randomUUID();
  const snapshotPropertyId = randomUUID();
  const ids = { first: randomUUID(), second: 'ffffffff-0000-4000-8000-000000000001', third: '00000000-0000-4000-8000-000000000002' };

  beforeAll(async () => {
    await prisma.roomInventory.create({ data: { roomId, propertyId: snapshotPropertyId, ownerId, version: 4, createdAt: new Date('2031-01-01T00:00:00Z'), updatedAt: new Date('2031-01-03T00:00:00Z') } });
    await prisma.inventoryItem.createMany({ data: [
      { id: ids.second, roomId, type: 'SERVICE', name: 'Spa', quantityAvailable: 0, active: false, createdAt: new Date('2031-01-02T00:00:00Z'), updatedAt: new Date('2031-01-03T00:00:00Z') },
      { id: ids.first, roomId, type: 'PRODUCT', name: 'Agua', quantityAvailable: 10, active: true, createdAt: new Date('2031-01-01T00:00:00Z'), updatedAt: new Date('2031-01-01T00:00:00Z') },
      { id: ids.third, roomId, type: 'PRODUCT', name: 'Toallas', quantityAvailable: 4, active: true, createdAt: new Date('2031-01-02T00:00:00Z'), updatedAt: new Date('2031-01-02T00:00:00Z') },
    ] });
  });

  afterAll(async () => {
    await prisma.roomInventory.deleteMany({ where: { roomId } });
    await prisma.$disconnect();
  });

  it('reads the aggregate by primary key with active and inactive items in a stable order', async () => {
    const aggregate = await repository.findByRoomId(roomId);
    expect(aggregate).toMatchObject({ roomId, propertyId: snapshotPropertyId, ownerId, version: 4 });
    expect(aggregate?.items.map((item) => [item.id, item.active])).toEqual([[ids.first, true], [ids.third, true], [ids.second, false]]);
  });

  it('returns null for a room that was never written', async () => {
    await expect(repository.findByRoomId(emptyRoomId)).resolves.toBeNull();
  });

  it('serves the authoritative propertyId over the local snapshot, and an empty inventory without writing', async () => {
    const authoritativePropertyId = randomUUID();
    const rooms = { getContext: jest.fn(async (id: string) => ({ roomId: id, propertyId: authoritativePropertyId, ownerId, propertyStatus: 'PUBLISHED' as const })) };
    const useCase = new GetRoomInventoryUseCase(rooms, repository);
    await expect(useCase.execute({ viewer: { userId: ownerId, role: 'OWNER' }, roomId, traceId: 't' })).resolves.toMatchObject({ propertyId: authoritativePropertyId, version: 4 });
    await expect(useCase.execute({ viewer: { userId: ownerId, role: 'OWNER' }, roomId: emptyRoomId, traceId: 't' })).resolves.toMatchObject({ version: 0, items: [] });
    await expect(prisma.roomInventory.count({ where: { roomId: emptyRoomId } })).resolves.toBe(0);
  });

  it('maps a database outage to DEPENDENCY_UNAVAILABLE without leaking driver details', async () => {
    const offline = new PrismaInventoryRepository(new PrismaService({ datasources: { db: { url: 'postgresql://x:y@127.0.0.1:1/inventory_db?connect_timeout=1' } } }));
    await expect(offline.findByRoomId(roomId)).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE', message: 'DEPENDENCY_UNAVAILABLE' });
  }, 30_000);
});
