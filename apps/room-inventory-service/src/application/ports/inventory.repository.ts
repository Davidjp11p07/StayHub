import type { PersistedRoomInventory } from '../../domain/room-inventory';

/**
 * Persistence port for the RoomInventory aggregate. Iteration 1 needs only the read side;
 * transactional `addItem` (US2, T046) and `replace` (US3, T057) are added with their use cases.
 */
export interface InventoryRepository {
  /** Aggregate with all items (active and inactive) in a stable order, or null when no write ever happened. */
  findByRoomId(roomId: string): Promise<PersistedRoomInventory | null>;
}

export const INVENTORY_REPOSITORY = Symbol('INVENTORY_REPOSITORY');
