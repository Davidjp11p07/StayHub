import { InventoryError } from './inventory-errors';
import { createItemProps, type InventoryItem, type InventoryItemProps } from './inventory-item';

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

export interface ReplacementItemInput extends InventoryItemProps { readonly id: string }
export interface ReplacementTransition { readonly changed: boolean; readonly items: readonly InventoryItem[] }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const sameProps = (a: InventoryItemProps, b: InventoryItemProps): boolean =>
  a.type === b.type && a.name === b.name && a.quantityAvailable === b.quantityAvailable && a.active === b.active;

/** Validates and normalizes the complete external collection before persistence starts. */
export function normalizeReplacementItems(
  requested: readonly ReplacementItemInput[], maxItems: number, maxQuantity: number,
): ReplacementItemInput[] {
  assertWithinItemLimit(requested.length, maxItems);
  const seen = new Set<string>();
  return requested.map((input) => {
    const id = typeof input.id === 'string' ? input.id.toLowerCase() : '';
    if (!UUID.test(id) || seen.has(id)) throw new InventoryError('VALIDATION_ERROR', 'items.id');
    seen.add(id);
    return { id, ...createItemProps(input, maxQuantity) };
  });
}

/** Pure full-replacement transition: known ids only, omissions become inactive, and identical state is a no-op. */
export function replacementTransition(
  current: readonly InventoryItem[],
  requested: readonly ReplacementItemInput[],
  maxItems: number,
  maxQuantity: number,
): ReplacementTransition {
  const normalized = normalizeReplacementItems(requested, maxItems, maxQuantity);
  const desired = new Map<string, InventoryItemProps>();
  for (const { id, ...props } of normalized) desired.set(id, props);
  const known = new Set(current.map((item) => item.id.toLowerCase()));
  for (const id of desired.keys()) if (!known.has(id)) throw new InventoryError('UNKNOWN_ITEM', 'items.id');

  let changed = false;
  const items = current.map((item): InventoryItem => {
    const props = desired.get(item.id.toLowerCase()) ?? { type: item.type, name: item.name, quantityAvailable: item.quantityAvailable, active: false };
    if (!sameProps(item, props)) changed = true;
    return { ...item, ...props };
  });
  return { changed, items: sortItems(items) };
}
