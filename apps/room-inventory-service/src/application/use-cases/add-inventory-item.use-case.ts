import type { AddInventoryItemPersistenceInput, InventoryRepository } from '../ports/inventory.repository';
import type { RoomContextPort } from '../ports/room-context.port';
import { createItemProps } from '../../domain/inventory-item';
import { readInventory, type RoomInventory } from '../../domain/room-inventory';
import { assertCanManageRoom, type InventoryViewer } from './inventory-viewer';

export interface AddInventoryItemInput {
  readonly viewer: InventoryViewer;
  readonly roomId: string;
  readonly traceId: string;
  readonly item: { readonly type: unknown; readonly name: unknown; readonly quantityAvailable: unknown; readonly active: unknown };
}

export interface InventoryWriteLimits {
  readonly maxItemsPerRoom: number;
  readonly maxQuantity: number;
}

/** US2 / INV-FR-002. Remote authorization and input validation happen before the short database transaction. */
export class AddInventoryItemUseCase {
  public constructor(
    private readonly rooms: RoomContextPort,
    private readonly repository: InventoryRepository,
    private readonly limits: InventoryWriteLimits,
  ) {}

  public async execute(input: AddInventoryItemInput): Promise<RoomInventory> {
    const context = await this.rooms.getContext(input.roomId, input.traceId);
    assertCanManageRoom(input.viewer, context);
    const item = createItemProps(input.item, this.limits.maxQuantity);
    const persistenceInput: AddInventoryItemPersistenceInput = {
      roomId: context.roomId,
      propertyId: context.propertyId,
      ownerId: context.ownerId,
      item,
      maxItems: this.limits.maxItemsPerRoom,
    };
    const persisted = await this.repository.addItem(persistenceInput);
    return readInventory(context.roomId, context.propertyId, persisted);
  }
}
