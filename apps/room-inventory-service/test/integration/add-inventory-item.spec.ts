import { randomUUID } from 'node:crypto';

import { InventoryError } from '@inventory/domain/inventory-errors';
import { PrismaInventoryRepository } from '@inventory/infrastructure/persistence/prisma/prisma-inventory.repository';
import { PrismaService } from '@inventory/infrastructure/persistence/prisma/prisma.service';

const url = process.env.INVENTORY_TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

describeDb('add inventory item transaction on PostgreSQL 16', () => {
  const prisma = new PrismaService({ datasources: { db: { url: url ?? '' } } });
  const repository = new PrismaInventoryRepository(prisma);
  const roomIds = new Set<string>();
  const ownerId = randomUUID();

  afterEach(async () => prisma.roomInventory.deleteMany({ where: { roomId: { in: [...roomIds] } } }));
  afterAll(async () => prisma.$disconnect());

  const input = (roomId: string, propertyId: string, owner = ownerId) => ({
    roomId, propertyId, ownerId: owner, maxItems: 200,
    item: { type: 'PRODUCT' as const, name: 'Agua', quantityAvailable: 4, active: true },
  });

  it('creates version 1 then appends atomically as version 2 with UUIDs', async () => {
    const roomId = randomUUID(); roomIds.add(roomId);
    const firstProperty = randomUUID();
    const first = await repository.addItem(input(roomId, firstProperty));
    expect(first).toMatchObject({ roomId, propertyId: firstProperty, ownerId, version: 1, items: [{ name: 'Agua' }] });
    expect(first.items[0]?.id).toMatch(/^[0-9a-f-]{36}$/u);

    const authoritativeProperty = randomUUID();
    const authoritativeOwner = randomUUID();
    const second = await repository.addItem({ ...input(roomId, authoritativeProperty, authoritativeOwner), item: { type: 'SERVICE', name: 'Spa', quantityAvailable: 0, active: false } });
    expect(second).toMatchObject({ propertyId: authoritativeProperty, ownerId: authoritativeOwner, version: 2 });
    expect(second.items).toHaveLength(2);
    await expect(prisma.roomInventory.findUnique({ where: { roomId } })).resolves.toMatchObject({ version: 2, propertyId: authoritativeProperty, ownerId: authoritativeOwner });
  });

  it('rejects item 201 and rolls back version, snapshot and item creation', async () => {
    const roomId = randomUUID(); roomIds.add(roomId);
    const originalProperty = randomUUID();
    await prisma.roomInventory.create({ data: { roomId, propertyId: originalProperty, ownerId, version: 7 } });
    await prisma.inventoryItem.createMany({ data: Array.from({ length: 200 }, (_, index) => ({
      id: randomUUID(), roomId, type: 'PRODUCT' as const, name: `Item ${index}`, quantityAvailable: index, active: true,
    })) });

    await expect(repository.addItem(input(roomId, randomUUID()))).rejects.toBeInstanceOf(InventoryError);
    await expect(prisma.roomInventory.findUnique({ where: { roomId }, include: { items: true } })).resolves.toMatchObject({ version: 7, propertyId: originalProperty, items: { length: 200 } });
  });
});
