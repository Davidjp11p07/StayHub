import { randomUUID } from 'node:crypto';
import { PrismaInventoryRepository } from '@inventory/infrastructure/persistence/prisma/prisma-inventory.repository';
import { PrismaService } from '@inventory/infrastructure/persistence/prisma/prisma.service';

const url = process.env.INVENTORY_TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

describeDb('replace inventory transaction', () => {
  const prisma = new PrismaService({ datasources: { db: { url: url ?? '' } } });
  const repository = new PrismaInventoryRepository(prisma);
  const roomId = randomUUID(); const propertyId = randomUUID(); const ownerId = randomUUID();
  const ids = [randomUUID(), randomUUID()];
  beforeEach(async () => {
    await prisma.roomInventory.create({ data: { roomId, propertyId, ownerId, version: 1, items: { create: [
      { id: ids[0]!, type: 'PRODUCT', name: 'Agua', quantityAvailable: 2, active: true },
      { id: ids[1]!, type: 'SERVICE', name: 'Spa', quantityAvailable: 1, active: true },
    ] } } });
  });
  afterEach(async () => prisma.roomInventory.deleteMany({ where: { roomId } }));
  afterAll(async () => prisma.$disconnect());

  const desired = (name = 'Agua mineral') => [{ id: ids[0]!, type: 'PRODUCT' as const, name, quantityAvailable: 5, active: true }];

  it('updates atomically, soft-deactivates omission and supports replay/no-op', async () => {
    const first = await repository.replace({ roomId, propertyId, ownerId, expectedVersion: 1, items: desired(), maxItems: 200, maxQuantity: 1_000_000 });
    expect(first?.version).toBe(2);
    expect(first?.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: ids[0], name: 'Agua mineral' }), expect.objectContaining({ id: ids[1], active: false })]));
    await expect(repository.replace({ roomId, propertyId, ownerId, expectedVersion: 1, items: desired(), maxItems: 200, maxQuantity: 1_000_000 })).resolves.toMatchObject({ version: 2 });
    await expect(repository.replace({ roomId, propertyId, ownerId, expectedVersion: 1, items: desired('Otro'), maxItems: 200, maxQuantity: 1_000_000 })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  it('rolls back every change for an unknown id', async () => {
    await expect(repository.replace({ roomId, propertyId, ownerId, expectedVersion: 1, items: [{ ...desired()[0]!, id: randomUUID() }], maxItems: 200, maxQuantity: 1_000_000 })).rejects.toMatchObject({ code: 'UNKNOWN_ITEM' });
    await expect(repository.findByRoomId(roomId)).resolves.toMatchObject({ version: 1, items: [expect.objectContaining({ active: true }), expect.objectContaining({ active: true })] });
  });
});
