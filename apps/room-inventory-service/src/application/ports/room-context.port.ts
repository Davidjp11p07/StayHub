export type PropertyStatus = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';

/** Minimal authoritative room context from Accommodations (accommodations-inventory-context.openapi.yaml). */
export interface RoomContext {
  readonly roomId: string;
  readonly propertyId: string;
  readonly ownerId: string;
  readonly propertyStatus: PropertyStatus;
}

/**
 * Resolves who owns a room. Implementations throw InventoryError:
 * ROOM_NOT_FOUND (missing or hidden; indistinguishable) or DEPENDENCY_UNAVAILABLE (timeout, open circuit, 5xx,
 * invalid credentials or invalid response). They never fall back to local data.
 */
export interface RoomContextPort {
  getContext(roomId: string, traceId: string): Promise<RoomContext>;
}

export const ROOM_CONTEXT_PORT = Symbol('ROOM_CONTEXT_PORT');
