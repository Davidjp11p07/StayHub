import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@inventory/infrastructure/persistence/generated/client';

/**
 * Reproducible dataset for the GET performance gate (T068): one room at the 200-item ceiling, mixed types and states,
 * plus OWNER/ADMIN identities. Deterministic content (seeded by index) so runs are comparable.
 */
export const PERFORMANCE_ITEMS = 200;

export interface PerformanceDataset {
  readonly roomId: string;
  readonly propertyId: string;
  readonly ownerId: string;
  readonly adminId: string;
  readonly items: ReadonlyArray<{ id: string; type: 'PRODUCT' | 'SERVICE'; name: string; quantityAvailable: number; active: boolean; createdAt: Date; updatedAt: Date }>;
}

export function buildPerformanceDataset(seed = 'perf'): PerformanceDataset {
  const base = Date.UTC(2031, 0, 1);
  const items = Array.from({ length: PERFORMANCE_ITEMS }, (_, index) => {
    const at = new Date(base + index * 60_000);
    return {
      id: randomUUID(),
      type: index % 3 === 0 ? 'SERVICE' as const : 'PRODUCT' as const,
      name: `${seed} item ${String(index + 1).padStart(3, '0')} ${'x'.repeat(index % 90)}`.slice(0, 120).trim(),
      quantityAvailable: (index * 7919) % 1_000_001,
      active: index % 10 !== 0,
      createdAt: at,
      updatedAt: at,
    };
  });
  return { roomId: randomUUID(), propertyId: randomUUID(), ownerId: randomUUID(), adminId: randomUUID(), items };
}

/** Inserts the dataset in one transaction; returns a cleanup function. */
export async function seedPerformanceDataset(prisma: PrismaClient, dataset: PerformanceDataset): Promise<() => Promise<void>> {
  await prisma.$transaction([
    prisma.roomInventory.create({ data: { roomId: dataset.roomId, propertyId: dataset.propertyId, ownerId: dataset.ownerId, version: 1 } }),
    prisma.inventoryItem.createMany({ data: dataset.items.map((item) => ({ ...item, roomId: dataset.roomId })) }),
  ]);
  return async () => { await prisma.roomInventory.deleteMany({ where: { roomId: dataset.roomId } }); };
}
