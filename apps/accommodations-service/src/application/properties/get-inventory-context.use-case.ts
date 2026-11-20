import { DomainError } from '@accommodations/domain/shared/domain-error';
import type { PropertyStatus } from '@accommodations/domain/properties/property.types';
import type { PropertyRepository } from '../ports/property.repository';

/** Minimal, closed view consumed by room-inventory-service; never exposes names, prices or locations. */
export interface RoomInventoryContext {
  propertyId: string;
  roomId: string;
  ownerId: string;
  propertyStatus: PropertyStatus;
  roomExists: true;
}

export class GetInventoryContextUseCase {
  constructor(private readonly properties: PropertyRepository) {}

  async execute(roomId: string): Promise<RoomInventoryContext> {
    const property = await this.properties.findByRoomId(roomId);
    const room = property?.rooms.find((candidate) => candidate.id === roomId);
    if (!property || !room) throw new DomainError('NOT_FOUND');
    return {
      propertyId: property.id,
      roomId: room.id,
      ownerId: property.ownerId,
      propertyStatus: property.status,
      roomExists: true,
    };
  }
}
