import { InventoryError } from '../../domain/inventory-errors';
import type { RoomContext } from '../ports/room-context.port';

export type InventoryRole = 'OWNER' | 'ADMIN' | 'GUEST';

/** Authenticated caller derived only from the verified delegated JWT (`sub`, `role`). */
export interface InventoryViewer {
  readonly userId: string;
  readonly role: InventoryRole;
}

/** INV-FR-004: ADMIN manages any room; OWNER only rooms whose authoritative ownerId is its own; GUEST never. */
export function assertCanManageRoom(viewer: InventoryViewer, context: RoomContext): void {
  if (viewer.role === 'ADMIN') return;
  if (viewer.role === 'OWNER' && viewer.userId === context.ownerId.toLowerCase()) return;
  throw new InventoryError('FORBIDDEN');
}
