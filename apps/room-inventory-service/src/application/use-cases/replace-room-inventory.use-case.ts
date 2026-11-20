import { InventoryError } from '../../domain/inventory-errors';
import { normalizeReplacementItems, readInventory, type ReplacementItemInput, type RoomInventory } from '../../domain/room-inventory';
import type { InventoryRepository } from '../ports/inventory.repository';
import type { RoomContextPort } from '../ports/room-context.port';
import type { InventoryWriteLimits } from './add-inventory-item.use-case';
import { assertCanManageRoom, type InventoryViewer } from './inventory-viewer';

export interface ReplaceRoomInventoryInput {
  readonly viewer: InventoryViewer;
  readonly roomId: string;
  readonly traceId: string;
  readonly expectedVersion: number;
  readonly items: readonly ReplacementItemInput[];
}

export class ReplaceRoomInventoryUseCase {
  public constructor(private readonly rooms: RoomContextPort, private readonly repository: InventoryRepository, private readonly limits: InventoryWriteLimits) {}

  public async execute(input: ReplaceRoomInventoryInput): Promise<RoomInventory> {
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) throw new InventoryError('VALIDATION_ERROR', 'expectedVersion');
    const items = normalizeReplacementItems(input.items, this.limits.maxItemsPerRoom, this.limits.maxQuantity);
    const context = await this.rooms.getContext(input.roomId, input.traceId);
    assertCanManageRoom(input.viewer, context);
    const persisted = await this.repository.replace({
      roomId: context.roomId, propertyId: context.propertyId, ownerId: context.ownerId,
      expectedVersion: input.expectedVersion, items,
      maxItems: this.limits.maxItemsPerRoom, maxQuantity: this.limits.maxQuantity,
    });
    return readInventory(context.roomId, context.propertyId, persisted);
  }
}
