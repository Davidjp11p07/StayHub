import { InventoryError } from './inventory-errors';
import type { InventoryItem } from './inventory-item';

export const MAX_ITEMS_PER_ROOM = 200;

/** Persisted aggregate. `ownerId`/`propertyId` are opaque Accommodations references (snapshot, revalidated per call). */
export interface PersistedRoomInventory {
  readonly roomId: string;
  readonly propertyId: string;
  readonly ownerId: string;
  /** >= 1 once persisted. */
  readonly version: number;
  readonly items: readonly InventoryItem[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Read model. A valid room that was never written is `version = 0`, `items = []`, timestamps `null`. */
export interface RoomInventory {
  readonly roomId: string;
  readonly propertyId: string;
  readonly version: number;
  readonly items: readonly InventoryItem[];
  readonly createdAt: Date | null;
  readonly updatedAt: Date | null;
}

/** Stable order: creation time, then id. */
export function sortItems(items: readonly InventoryItem[]): InventoryItem[] {
  return [...items].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function emptyInventory(roomId: string, propertyId: string): RoomInventory {
  return { roomId, propertyId, version: 0, items: [], createdAt: null, updatedAt: null };
}

/**
 * Builds the read model. `propertyId` comes from the authoritative Accommodations context, never from the local
 * snapshot, so a moved room is reported correctly even before the next write refreshes the snapshot.
 */
export function readInventory(roomId: string, authoritativePropertyId: string, persisted: PersistedRoomInventory | null): RoomInventory {
  if (!persisted) return emptyInventory(roomId, authoritativePropertyId);
  if (persisted.version < 1) throw new InventoryError('DEPENDENCY_UNAVAILABLE');
  return {
    roomId,
    propertyId: authoritativePropertyId,
    version: persisted.version,
    items: sortItems(persisted.items),
    createdAt: persisted.createdAt,
    updatedAt: persisted.updatedAt,
  };
}

/** Aggregate invariant: at most `max` items (active and inactive) per room. */
export function assertWithinItemLimit(count: number, max: number = MAX_ITEMS_PER_ROOM): void {
  if (count > Math.min(max, MAX_ITEMS_PER_ROOM)) throw new InventoryError('INVENTORY_LIMIT_EXCEEDED');
}
