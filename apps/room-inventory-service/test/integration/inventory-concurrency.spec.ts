import { randomUUID } from 'node:crypto';
import { PrismaInventoryRepository } from '@inventory/infrastructure/persistence/prisma/prisma-inventory.repository';
import { PrismaService } from '@inventory/infrastructure/persistence/prisma/prisma.service';

const url = process.env.INVENTORY_TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

describeDb('inventory optimistic concurrency', () => {
  const prisma = new PrismaService({ datasources: { db: { url: url ?? '' } } });
  const repository = new PrismaInventoryRepository(prisma);
  const roomId = randomUUID(); const propertyId = randomUUID(); const ownerId = randomUUID(); const id = randomUUID();
  beforeEach(async () => prisma.roomInventory.create({ data: { roomId, propertyId, ownerId, version: 1, items: { create: { id, type: 'PRODUCT', name: 'Agua', quantityAvailable: 1, active: true } } } }));
  afterEach(async () => prisma.roomInventory.deleteMany({ where: { roomId } }));
  afterAll(async () => prisma.$disconnect());

  it('allows exactly one divergent PUT for the same expected version', async () => {
    const replace = (name: string) => repository.replace({ roomId, propertyId, ownerId, expectedVersion: 1, items: [{ id, type: 'PRODUCT', name, quantityAvailable: 1, active: true }], maxItems: 200, maxQuantity: 1_000_000 });
    const results = await Promise.allSettled([replace('Ganador A'), replace('Ganador B')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected' && result.reason?.code === 'VERSION_CONFLICT')).toHaveLength(1);
    await expect(repository.findByRoomId(roomId)).resolves.toMatchObject({ version: 2 });
  });
});
