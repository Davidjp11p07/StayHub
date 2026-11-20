import { randomUUID } from 'node:crypto';

import { Injectable, Optional } from '@nestjs/common';

import type { AddInventoryItemPersistenceInput, InventoryRepository, ReplaceRoomInventoryPersistenceInput } from '@inventory/application/ports/inventory.repository';
import type { InventoryItem } from '@inventory/domain/inventory-item';
import { assertWithinItemLimit, replacementTransition, type PersistedRoomInventory } from '@inventory/domain/room-inventory';
import { InventoryError } from '@inventory/domain/inventory-errors';
import { InventoryMetrics } from '@inventory/infrastructure/observability/inventory-metrics';

import { Prisma, type InventoryItem as ItemRow, type RoomInventory as InventoryRow } from '../generated/client';
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
      const aggregate = row ? toAggregate(row) : null;
      this.metrics?.itemCount(aggregate?.items.length ?? 0, { operation: 'get' });
      return aggregate;
    } catch (error) {
      throw toInventoryError(error);
    } finally {
      this.metrics?.dbDuration(Number(process.hrtime.bigint() - started) / 1e9, { operation: 'find_by_room' });
    }
  }

  public async addItem(input: AddInventoryItemPersistenceInput): Promise<PersistedRoomInventory> {
    const started = process.hrtime.bigint();
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const current = await transaction.roomInventory.findUnique({
          where: { roomId: input.roomId },
          select: { _count: { select: { items: true } } },
        });
        assertWithinItemLimit((current?._count.items ?? 0) + 1, input.maxItems);

        const item = { id: randomUUID(), ...input.item };
        const include = { items: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] } };
        if (!current) {
          const created = await transaction.roomInventory.create({
            data: {
              roomId: input.roomId, propertyId: input.propertyId, ownerId: input.ownerId, version: 1,
              items: { create: item },
            },
            include,
          });
          const aggregate = toAggregate(created);
          this.metrics?.itemCount(aggregate.items.length, { operation: 'add' });
          return aggregate;
        }

        const updated = await transaction.roomInventory.update({
          where: { roomId: input.roomId },
          data: {
            propertyId: input.propertyId,
            ownerId: input.ownerId,
            version: { increment: 1 },
            updatedAt: new Date(),
            items: { create: item },
          },
          include,
        });
        const aggregate = toAggregate(updated);
        this.metrics?.itemCount(aggregate.items.length, { operation: 'add' });
        return aggregate;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      throw toInventoryError(error);
    } finally {
      this.metrics?.dbDuration(Number(process.hrtime.bigint() - started) / 1e9, { operation: 'add_item' });
    }
  }

  public async replace(input: ReplaceRoomInventoryPersistenceInput): Promise<PersistedRoomInventory | null> {
    const started = process.hrtime.bigint();
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const currentRow = await transaction.roomInventory.findUnique({
          where: { roomId: input.roomId }, include: { items: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
        });
        const current = currentRow ? toAggregate(currentRow) : null;
        const transition = replacementTransition(current?.items ?? [], input.items, input.maxItems, input.maxQuantity);
        const currentVersion = current?.version ?? 0;
        if (input.expectedVersion !== currentVersion) {
          if (!transition.changed) {
            this.metrics?.itemCount(current?.items.length ?? 0, { operation: 'replace' });
            return current;
          }
          throw new InventoryError('VERSION_CONFLICT');
        }
        if (!transition.changed) {
          this.metrics?.itemCount(current?.items.length ?? 0, { operation: 'replace' });
          return current;
        }
        if (!current) throw new InventoryError('UNKNOWN_ITEM', 'items.id');

        const versionUpdate = await transaction.roomInventory.updateMany({
          where: { roomId: input.roomId, version: input.expectedVersion },
          data: { propertyId: input.propertyId, ownerId: input.ownerId, version: { increment: 1 }, updatedAt: new Date() },
        });
        if (versionUpdate.count !== 1) throw new InventoryError('VERSION_CONFLICT');
        for (const item of [...transition.items].sort((a, b) => a.id.localeCompare(b.id))) {
          await transaction.inventoryItem.update({
            where: { id: item.id },
            data: { type: item.type, name: item.name, quantityAvailable: item.quantityAvailable, active: item.active, updatedAt: new Date() },
          });
        }
        const updated = await transaction.roomInventory.findUniqueOrThrow({
          where: { roomId: input.roomId }, include: { items: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
        });
        const aggregate = toAggregate(updated);
        this.metrics?.itemCount(aggregate.items.length, { operation: 'replace' });
        return aggregate;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      throw toInventoryError(error);
    } finally {
      this.metrics?.dbDuration(Number(process.hrtime.bigint() - started) / 1e9, { operation: 'replace' });
    }
  }
}
