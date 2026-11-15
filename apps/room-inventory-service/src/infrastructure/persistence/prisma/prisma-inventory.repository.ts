import { Injectable, Optional } from '@nestjs/common';

import type { InventoryRepository } from '@inventory/application/ports/inventory.repository';
import type { InventoryItem } from '@inventory/domain/inventory-item';
import type { PersistedRoomInventory } from '@inventory/domain/room-inventory';
import { InventoryMetrics } from '@inventory/infrastructure/observability/inventory-metrics';

import type { InventoryItem as ItemRow, RoomInventory as InventoryRow } from '../generated/client';
import { toInventoryError } from './database-error';
import { PrismaService } from './prisma.service';

function toItem(row: ItemRow): InventoryItem {
  return {
    id: row.id, type: row.type, name: row.name, quantityAvailable: row.quantityAvailable, active: row.active,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

function toAggregate(row: InventoryRow & { items: ItemRow[] }): PersistedRoomInventory {
  return {
    roomId: row.roomId, propertyId: row.propertyId, ownerId: row.ownerId, version: row.version,
    items: row.items.map(toItem), createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

/** Prisma adapter of the RoomInventory aggregate. Only inventory_db tables; no joins with remote data. */
@Injectable()
export class PrismaInventoryRepository implements InventoryRepository {
  public constructor(private readonly prisma: PrismaService, @Optional() private readonly metrics?: InventoryMetrics) {}

  public async findByRoomId(roomId: string): Promise<PersistedRoomInventory | null> {
    const started = process.hrtime.bigint();
    try {
      const row = await this.prisma.roomInventory.findUnique({
        where: { roomId },
        include: { items: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
      });
      return row ? toAggregate(row) : null;
    } catch (error) {
      throw toInventoryError(error);
    } finally {
      this.metrics?.dbDuration(Number(process.hrtime.bigint() - started) / 1e9, { operation: 'find_by_room' });
    }
  }
}
