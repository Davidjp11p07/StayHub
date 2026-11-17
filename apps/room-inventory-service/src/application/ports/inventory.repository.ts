import type { InventoryItemProps } from '../../domain/inventory-item';
import type { PersistedRoomInventory, ReplacementItemInput } from '../../domain/room-inventory';

export interface AddInventoryItemPersistenceInput {
  readonly roomId: string;
  readonly propertyId: string;
  readonly ownerId: string;
  readonly item: InventoryItemProps;
  readonly maxItems: number;
}

export interface ReplaceRoomInventoryPersistenceInput {
  readonly roomId: string;
  readonly propertyId: string;
  readonly ownerId: string;
  readonly expectedVersion: number;
  readonly items: readonly ReplacementItemInput[];
  readonly maxItems: number;
  readonly maxQuantity: number;
}

/**
 * Persistence port for the RoomInventory aggregate. Implementations own atomicity and database-generated state.
 */
export interface InventoryRepository {
  /** Aggregate with all items (active and inactive) in a stable order, or null when no write ever happened. */
  findByRoomId(roomId: string): Promise<PersistedRoomInventory | null>;
  /** Creates/appends one item and increments the aggregate version in the same transaction. */
  addItem(input: AddInventoryItemPersistenceInput): Promise<PersistedRoomInventory>;
  /** Full replacement; null represents an unchanged synthetic version-0 inventory. */
  replace(input: ReplaceRoomInventoryPersistenceInput): Promise<PersistedRoomInventory | null>;
}

export const INVENTORY_REPOSITORY = Symbol('INVENTORY_REPOSITORY');
