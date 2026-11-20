import { randomUUID } from 'node:crypto';

import type { AddInventoryItemPersistenceInput, InventoryRepository, ReplaceRoomInventoryPersistenceInput } from '@inventory/application/ports/inventory.repository';
import type { RoomContext, RoomContextPort } from '@inventory/application/ports/room-context.port';
import { AddInventoryItemUseCase } from '@inventory/application/use-cases/add-inventory-item.use-case';
import { InventoryError } from '@inventory/domain/inventory-errors';
import type { PersistedRoomInventory } from '@inventory/domain/room-inventory';

const ownerId = randomUUID();
const context: RoomContext = { roomId: randomUUID(), propertyId: randomUUID(), ownerId, propertyStatus: 'PUBLISHED' };
const now = new Date('2031-02-03T04:05:06.000Z');

function aggregate(version: number, name = 'Agua mineral'): PersistedRoomInventory {
  return {
    roomId: context.roomId, propertyId: context.propertyId, ownerId, version, createdAt: now, updatedAt: now,
    items: [{ id: randomUUID(), type: 'PRODUCT', name, quantityAvailable: 4, active: true, createdAt: now, updatedAt: now }],
  };
}

describe('AddInventoryItemUseCase', () => {
  const rooms: jest.Mocked<RoomContextPort> = { getContext: jest.fn<Promise<RoomContext>, [string, string]>(async () => context) };
  const repository = {
    findByRoomId: jest.fn<Promise<PersistedRoomInventory | null>, [string]>(async () => null),
    addItem: jest.fn<Promise<PersistedRoomInventory>, [AddInventoryItemPersistenceInput]>(async () => aggregate(1)),
    replace: jest.fn<Promise<PersistedRoomInventory | null>, [ReplaceRoomInventoryPersistenceInput]>(),
  } satisfies jest.Mocked<InventoryRepository>;
  const useCase = new AddInventoryItemUseCase(rooms, repository, { maxItemsPerRoom: 200, maxQuantity: 1_000_000 });

  beforeEach(() => jest.clearAllMocks());

  it('normalizes fields, creates the first persisted version and returns a UUID item', async () => {
    repository.addItem.mockResolvedValueOnce(aggregate(1));
    const result = await useCase.execute({
      viewer: { userId: ownerId, role: 'OWNER' }, roomId: context.roomId, traceId: 'trace-add',
      item: { type: 'PRODUCT', name: '  Agua   mineral ', quantityAvailable: 4, active: true },
    });

    expect(repository.addItem).toHaveBeenCalledWith(expect.objectContaining({
      roomId: context.roomId, propertyId: context.propertyId, ownerId,
      item: { type: 'PRODUCT', name: 'Agua mineral', quantityAvailable: 4, active: true }, maxItems: 200,
    }));
    expect(result).toMatchObject({ version: 1, items: [{ name: 'Agua mineral' }] });
    expect(result.items[0]?.id).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it('returns the repository version transition N to N+1', async () => {
    repository.addItem.mockResolvedValueOnce(aggregate(8, 'Spa'));
    await expect(useCase.execute({
      viewer: { userId: randomUUID(), role: 'ADMIN' }, roomId: context.roomId, traceId: 't',
      item: { type: 'SERVICE', name: 'Spa', quantityAvailable: 0, active: false },
    })).resolves.toMatchObject({ version: 8, items: [{ type: 'PRODUCT', name: 'Spa' }] });
  });

  it.each([
    [{ type: 'FOOD', name: 'Agua', quantityAvailable: 1, active: true }, 'type'],
    [{ type: 'PRODUCT', name: ' ', quantityAvailable: 1, active: true }, 'name'],
    [{ type: 'PRODUCT', name: 'Agua', quantityAvailable: 1_000_001, active: true }, 'quantityAvailable'],
  ])('rejects invalid item %j before persistence', async (item, field) => {
    await expect(useCase.execute({ viewer: { userId: ownerId, role: 'OWNER' }, roomId: context.roomId, traceId: 't', item })).rejects.toMatchObject({ code: 'VALIDATION_ERROR', field });
    expect(repository.addItem).not.toHaveBeenCalled();
  });

  it('propagates the atomic 201st-item limit without returning a partial result', async () => {
    repository.addItem.mockRejectedValueOnce(new InventoryError('INVENTORY_LIMIT_EXCEEDED'));
    await expect(useCase.execute({
      viewer: { userId: ownerId, role: 'OWNER' }, roomId: context.roomId, traceId: 't',
      item: { type: 'PRODUCT', name: 'Agua', quantityAvailable: 1, active: true },
    })).rejects.toMatchObject({ code: 'INVENTORY_LIMIT_EXCEEDED' });
  });

  it('forbids another OWNER before opening a database transaction', async () => {
    await expect(useCase.execute({
      viewer: { userId: randomUUID(), role: 'OWNER' }, roomId: context.roomId, traceId: 't',
      item: { type: 'PRODUCT', name: 'Agua', quantityAvailable: 1, active: true },
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(repository.addItem).not.toHaveBeenCalled();
  });
});
