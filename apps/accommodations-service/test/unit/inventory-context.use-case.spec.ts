import { randomUUID } from 'node:crypto';

import { GetInventoryContextUseCase } from '../../src/application/properties/get-inventory-context.use-case';
import type { PropertyRepository } from '../../src/application/ports/property.repository';
import type { Property } from '../../src/domain/properties/property.types';

const ownerId = randomUUID();
const roomId = randomUUID();
const property = (): Property => ({
  id: randomUUID(), ownerId, type: 'APARTMENT', name: 'Apartamento sintético', description: null,
  location: { addressLine: 'Calle 1', city: 'Bogotá', region: 'Cundinamarca', country: 'CO' },
  status: 'DRAFT', version: 1,
  rooms: [{ id: roomId, name: 'Principal', capacity: 2, basePrice: { amount: '120000.00', currency: 'COP' } }],
  features: [], photos: [], createdAt: new Date(), updatedAt: new Date(),
});

describe('get inventory context use case (T026)', () => {
  it('returns only the closed authoritative context, including non-published status', async () => {
    const found = property();
    const repo = { findByRoomId: jest.fn().mockResolvedValue(found) } as unknown as PropertyRepository;
    await expect(new GetInventoryContextUseCase(repo).execute(roomId)).resolves.toEqual({
      propertyId: found.id, roomId, ownerId, propertyStatus: 'DRAFT', roomExists: true,
    });
    expect(JSON.stringify(await new GetInventoryContextUseCase(repo).execute(roomId))).not.toMatch(/Apartamento|120000|addressLine/u);
  });

  it('maps unknown properties and rooms to the same NOT_FOUND error', async () => {
    const missing = { findByRoomId: jest.fn().mockResolvedValue(null) } as unknown as PropertyRepository;
    const otherRoom = { findByRoomId: jest.fn().mockResolvedValue(property()) } as unknown as PropertyRepository;
    await expect(new GetInventoryContextUseCase(missing).execute(roomId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(new GetInventoryContextUseCase(otherRoom).execute(randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
