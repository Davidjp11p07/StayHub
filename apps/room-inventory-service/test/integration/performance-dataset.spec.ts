import { PrismaInventoryRepository } from '@inventory/infrastructure/persistence/prisma/prisma-inventory.repository';
import { PrismaService } from '@inventory/infrastructure/persistence/prisma/prisma.service';

import { buildPerformanceDataset, PERFORMANCE_ITEMS, seedPerformanceDataset } from '../fixtures/performance-dataset';

const url = process.env.INVENTORY_TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

describe('performance dataset (T064)', () => {
  it('builds one room at the 200-item ceiling within the contract limits', () => {
    const dataset = buildPerformanceDataset();
    expect(dataset.items).toHaveLength(PERFORMANCE_ITEMS);
    expect(new Set(dataset.items.map((item) => item.id)).size).toBe(PERFORMANCE_ITEMS);
    for (const item of dataset.items) {
      expect(item.name.length).toBeGreaterThanOrEqual(1);
      expect(item.name.length).toBeLessThanOrEqual(120);
      expect(item.name).toBe(item.name.trim());
      expect(item.quantityAvailable).toBeGreaterThanOrEqual(0);
      expect(item.quantityAvailable).toBeLessThanOrEqual(1_000_000);
    }
    expect(dataset.items.some((item) => !item.active)).toBe(true);
    expect(dataset.items.some((item) => item.type === 'SERVICE')).toBe(true);
  });
});

describeDb('performance dataset on PostgreSQL 16', () => {
  const prisma = new PrismaService({ datasources: { db: { url: url ?? '' } } });
  afterAll(async () => { await prisma.$disconnect(); });

  it('seeds through the database constraints and reads back all 200 items', async () => {
    const dataset = buildPerformanceDataset();
    const cleanup = await seedPerformanceDataset(prisma, dataset);
    try {
      const aggregate = await new PrismaInventoryRepository(prisma).findByRoomId(dataset.roomId);
      expect(aggregate?.items).toHaveLength(PERFORMANCE_ITEMS);
    } finally {
      await cleanup();
    }
  });
});
