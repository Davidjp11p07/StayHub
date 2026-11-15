import type { InventoryItem, InventoryItemType } from '@inventory/domain/inventory-item';
import type { RoomInventory } from '@inventory/domain/room-inventory';

/** JSON shapes of openapi-room-inventory.yaml. ownerId is never exposed; no personal data exists in the model. */
export interface InventoryItemView {
  id: string;
  type: InventoryItemType;
  name: string;
  quantityAvailable: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RoomInventoryView {
  roomId: string;
  propertyId: string;
  version: number;
  items: InventoryItemView[];
  createdAt: string | null;
  updatedAt: string | null;
}

function presentItem(item: InventoryItem): InventoryItemView {
  return {
    id: item.id, type: item.type, name: item.name, quantityAvailable: item.quantityAvailable, active: item.active,
    createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
  };
}

export function presentRoomInventory(inventory: RoomInventory): RoomInventoryView {
  return {
    roomId: inventory.roomId,
    propertyId: inventory.propertyId,
    version: inventory.version,
    items: inventory.items.map(presentItem),
    createdAt: inventory.createdAt?.toISOString() ?? null,
    updatedAt: inventory.updatedAt?.toISOString() ?? null,
  };
}
