import { GetRoomInventoryUseCase } from '@inventory/application/use-cases/get-room-inventory.use-case';
import { PrismaInventoryRepository } from '@inventory/infrastructure/persistence/prisma/prisma-inventory.repository';
import { PrismaService } from '@inventory/infrastructure/persistence/prisma/prisma.service';

import { buildPerformanceDataset, PERFORMANCE_ITEMS, seedPerformanceDataset } from '../fixtures/performance-dataset';

const url = process.env.INVENTORY_TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

const WARMUP = 5;
const SAMPLES = 30;

function p95(samples: readonly number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? Number.POSITIVE_INFINITY;
}

/** T068: GET with the 200-item ceiling must stay under p95 500 ms with error rate < 1 %, no cache in front. */
describeDb('GET inventory performance (T068)', () => {
  const prisma = new PrismaService({ datasources: { db: { url: url ?? '' } } });
  const repository = new PrismaInventoryRepository(prisma);

  afterAll(async () => { await prisma.$disconnect(); });

  it('records the query plan before the p95 gate and meets the Sprint 4 target', async () => {
    const dataset = buildPerformanceDataset('perf-t068');
    const cleanup = await seedPerformanceDataset(prisma, dataset);
    try {
      const plan = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': unknown }>>(
        'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id, type, name, quantity_available, active, created_at, updated_at FROM inventory_items WHERE room_id = $1::uuid ORDER BY created_at, id',
        dataset.roomId,
      );
      expect(plan).toHaveLength(1);
      process.stdout.write(`${JSON.stringify({ event: 'inventory.query-plan', items: PERFORMANCE_ITEMS, plan: plan[0]?.['QUERY PLAN'] })}\n`);

      const rooms = {
        getContext: async (roomId: string) => ({
          roomId, propertyId: dataset.propertyId, ownerId: dataset.ownerId, propertyStatus: 'PUBLISHED' as const,
        }),
      };
      const useCase = new GetRoomInventoryUseCase(rooms, repository);
      const viewer = { userId: dataset.ownerId, role: 'OWNER' as const };
      const samples: number[] = [];
      let errors = 0;

      for (let index = 0; index < WARMUP + SAMPLES; index += 1) {
        const started = process.hrtime.bigint();
        try {
          const inventory = await useCase.execute({ viewer, roomId: dataset.roomId, traceId: `perf-${index}` });
          expect(inventory.items).toHaveLength(PERFORMANCE_ITEMS);
        } catch {
          errors += 1;
        }
        if (index >= WARMUP) samples.push(Number(process.hrtime.bigint() - started) / 1e6);
      }

      const measured = { samples: samples.length, p95Ms: p95(samples), errors };
      process.stdout.write(`${JSON.stringify({ event: 'inventory.performance', ...measured })}\n`);
      expect(measured.p95Ms).toBeLessThan(500);
      expect(errors / Math.max(1, samples.length)).toBeLessThan(0.01);
    } finally {
      await cleanup();
    }
  }, 60_000);
});
