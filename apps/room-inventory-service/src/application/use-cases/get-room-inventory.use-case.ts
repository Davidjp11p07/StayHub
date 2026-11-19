import { readInventory, type RoomInventory } from '../../domain/room-inventory';
import type { InventoryRepository } from '../ports/inventory.repository';
import type { RoomContextPort } from '../ports/room-context.port';
import { assertCanManageRoom, type InventoryViewer } from './inventory-viewer';

export interface GetRoomInventoryInput {
  readonly viewer: InventoryViewer;
  readonly roomId: string;
  readonly traceId: string;
}

/**
 * US1 / INV-FR-001. Order matters: (1) Accommodations resolves the room (404 if missing/hidden, 503 if it cannot
 * answer — local data is never served as authorized), (2) ownership, (3) local read. A valid room that was never
 * written is returned as the synthetic empty inventory (version 0) without persisting anything.
 */
export class GetRoomInventoryUseCase {
  public constructor(private readonly rooms: RoomContextPort, private readonly repository: InventoryRepository) {}

  public async execute(input: GetRoomInventoryInput): Promise<RoomInventory> {
    const context = await this.rooms.getContext(input.roomId, input.traceId);
    assertCanManageRoom(input.viewer, context);
    const persisted = await this.repository.findByRoomId(context.roomId);
    return readInventory(context.roomId, context.propertyId, persisted);
  }
}
