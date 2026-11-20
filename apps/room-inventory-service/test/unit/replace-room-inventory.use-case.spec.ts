import { randomUUID } from 'node:crypto';

import type { InventoryRepository, ReplaceRoomInventoryPersistenceInput } from '@inventory/application/ports/inventory.repository';
import type { RoomContext, RoomContextPort } from '@inventory/application/ports/room-context.port';
import { ReplaceRoomInventoryUseCase } from '@inventory/application/use-cases/replace-room-inventory.use-case';
import { replacementTransition, type PersistedRoomInventory } from '@inventory/domain/room-inventory';

const ownerId = randomUUID();
const context: RoomContext = { roomId: randomUUID(), propertyId: randomUUID(), ownerId, propertyStatus: 'PUBLISHED' };
const now = new Date('2031-01-01T00:00:00Z');
const firstId = randomUUID();
const secondId = randomUUID();
const persisted = (version = 2): PersistedRoomInventory => ({
  roomId: context.roomId, propertyId: context.propertyId, ownerId, version, createdAt: now, updatedAt: now,
  items: [
    { id: firstId, type: 'PRODUCT', name: 'Agua', quantityAvailable: 3, active: true, createdAt: now, updatedAt: now },
    { id: secondId, type: 'SERVICE', name: 'Spa', quantityAvailable: 1, active: true, createdAt: now, updatedAt: now },
  ],
});

describe('replacementTransition', () => {
  it('normalizes changes, preserves known ids and deactivates omitted items', () => {
    const result = replacementTransition(persisted().items, [{ id: firstId, type: 'PRODUCT', name: ' Agua  mineral ', quantityAvailable: 5, active: true }], 200, 1_000_000);
    expect(result.changed).toBe(true);
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: firstId, name: 'Agua mineral', quantityAvailable: 5, active: true }),
      expect.objectContaining({ id: secondId, active: false }),
    ]));
  });

  it('detects no-op and rejects unknown or duplicate ids', () => {
    const same = persisted().items.map(({ id, type, name, quantityAvailable, active }) => ({ id, type, name, quantityAvailable, active }));
    expect(replacementTransition(persisted().items, same, 200, 1_000_000).changed).toBe(false);
    expect(() => replacementTransition(persisted().items, [{ ...same[0]!, id: randomUUID() }], 200, 1_000_000)).toThrow(expect.objectContaining({ code: 'UNKNOWN_ITEM' }));
    expect(() => replacementTransition(persisted().items, [same[0]!, same[0]!], 200, 1_000_000)).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR', field: 'items.id' }));
  });
});

describe('ReplaceRoomInventoryUseCase', () => {
  const rooms: jest.Mocked<RoomContextPort> = { getContext: jest.fn<Promise<RoomContext>, [string, string]>(async () => context) };
  const repository = {
    findByRoomId: jest.fn(), addItem: jest.fn(),
    replace: jest.fn<Promise<PersistedRoomInventory | null>, [ReplaceRoomInventoryPersistenceInput]>(async () => persisted(3)),
  } satisfies jest.Mocked<InventoryRepository>;
  const useCase = new ReplaceRoomInventoryUseCase(rooms, repository, { maxItemsPerRoom: 200, maxQuantity: 1_000_000 });

  beforeEach(() => jest.clearAllMocks());

  it('authorizes, validates and delegates the expected version', async () => {
    const result = await useCase.execute({ viewer: { userId: ownerId, role: 'OWNER' }, roomId: context.roomId, traceId: 't', expectedVersion: 2, items: [{ id: firstId, type: 'PRODUCT', name: 'Agua', quantityAvailable: 4, active: true }] });
    expect(repository.replace).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 2, roomId: context.roomId, propertyId: context.propertyId }));
    expect(result.version).toBe(3);
  });

  it('supports an empty version-0 no-op and forbids another owner before persistence', async () => {
    repository.replace.mockResolvedValueOnce(null);
    await expect(useCase.execute({ viewer: { userId: randomUUID(), role: 'ADMIN' }, roomId: context.roomId, traceId: 't', expectedVersion: 0, items: [] })).resolves.toMatchObject({ version: 0, items: [] });
    await expect(useCase.execute({ viewer: { userId: randomUUID(), role: 'OWNER' }, roomId: context.roomId, traceId: 't', expectedVersion: 2, items: [] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
