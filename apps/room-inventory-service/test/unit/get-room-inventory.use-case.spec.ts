import { randomUUID } from 'node:crypto';

import type { RoomContext, RoomContextPort } from '@inventory/application/ports/room-context.port';
import { GetRoomInventoryUseCase } from '@inventory/application/use-cases/get-room-inventory.use-case';
import { InventoryError } from '@inventory/domain/inventory-errors';
import { createItemProps, normalizeName } from '@inventory/domain/inventory-item';
import { assertWithinItemLimit, emptyInventory, readInventory, sortItems, type PersistedRoomInventory } from '@inventory/domain/room-inventory';

async function codeOf(action: () => unknown): Promise<string | undefined> {
  try {
    await action();
  } catch (error) {
    if (error instanceof InventoryError) return error.code;
    throw error;
  }
  return undefined;
}
const fieldOf = (action: () => unknown): string | undefined => {
  try { action(); } catch (error) { if (error instanceof InventoryError) return error.field; throw error; }
  return undefined;
};

const ownerId = randomUUID();
const context: RoomContext = { roomId: randomUUID(), propertyId: randomUUID(), ownerId, propertyStatus: 'PUBLISHED' };
const item = (id: string, createdAt: string, active = true) => ({ id, type: 'PRODUCT' as const, name: 'Agua', quantityAvailable: 3, active, createdAt: new Date(createdAt), updatedAt: new Date(createdAt) });

describe('InventoryItem rules', () => {
  it('normalizes the name (trim, collapse spaces) and keeps 1..120 characters', () => {
    expect(normalizeName('  Agua   mineral  ')).toBe('Agua mineral');
    expect(fieldOf(() => normalizeName('   '))).toBe('name');
    expect(fieldOf(() => normalizeName('x'.repeat(121)))).toBe('name');
    expect(normalizeName('x'.repeat(120))).toHaveLength(120);
  });

  it('accepts PRODUCT/SERVICE, quantities 0..1 000 000 and boolean active', () => {
    expect(createItemProps({ type: 'SERVICE', name: 'Spa', quantityAvailable: 0, active: false })).toEqual({ type: 'SERVICE', name: 'Spa', quantityAvailable: 0, active: false });
    expect(createItemProps({ type: 'PRODUCT', name: 'Agua', quantityAvailable: 1_000_000, active: true }).quantityAvailable).toBe(1_000_000);
  });

  it.each([
    [{ type: 'FOOD', name: 'Agua', quantityAvailable: 1, active: true }, 'type'],
    [{ type: 'PRODUCT', name: 7, quantityAvailable: 1, active: true }, 'name'],
    [{ type: 'PRODUCT', name: 'Agua', quantityAvailable: -1, active: true }, 'quantityAvailable'],
    [{ type: 'PRODUCT', name: 'Agua', quantityAvailable: 1.5, active: true }, 'quantityAvailable'],
    [{ type: 'PRODUCT', name: 'Agua', quantityAvailable: 1_000_001, active: true }, 'quantityAvailable'],
    [{ type: 'PRODUCT', name: 'Agua', quantityAvailable: '1', active: true }, 'quantityAvailable'],
    [{ type: 'PRODUCT', name: 'Agua', quantityAvailable: 1, active: 'yes' }, 'active'],
  ])('rejects %j on %s', (input, field) => {
    expect(fieldOf(() => createItemProps(input))).toBe(field);
  });

  it('honours a lower configured quantity ceiling but never a higher one', () => {
    expect(fieldOf(() => createItemProps({ type: 'PRODUCT', name: 'Agua', quantityAvailable: 11, active: true }, 10))).toBe('quantityAvailable');
    expect(fieldOf(() => createItemProps({ type: 'PRODUCT', name: 'Agua', quantityAvailable: 1_000_001, active: true }, 5_000_000))).toBe('quantityAvailable');
  });
});

describe('RoomInventory rules', () => {
  it('a room never written reads as version 0 with no items and null timestamps', () => {
    expect(emptyInventory(context.roomId, context.propertyId)).toEqual({ roomId: context.roomId, propertyId: context.propertyId, version: 0, items: [], createdAt: null, updatedAt: null });
  });

  it('uses the authoritative propertyId, not the local snapshot', () => {
    const persisted: PersistedRoomInventory = { roomId: context.roomId, propertyId: randomUUID(), ownerId, version: 2, items: [], createdAt: new Date(), updatedAt: new Date() };
    expect(readInventory(context.roomId, context.propertyId, persisted).propertyId).toBe(context.propertyId);
  });

  it('orders items by creation time, then id', () => {
    const items = [item('b', '2031-01-02T00:00:00Z'), item('c', '2031-01-01T00:00:00Z'), item('a', '2031-01-02T00:00:00Z')];
    expect(sortItems(items).map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });

  it('caps the aggregate at 200 items (active and inactive)', async () => {
    expect(() => assertWithinItemLimit(200)).not.toThrow();
    await expect(codeOf(() => assertWithinItemLimit(201))).resolves.toBe('INVENTORY_LIMIT_EXCEEDED');
    await expect(codeOf(() => assertWithinItemLimit(201, 500))).resolves.toBe('INVENTORY_LIMIT_EXCEEDED');
    await expect(codeOf(() => assertWithinItemLimit(11, 10))).resolves.toBe('INVENTORY_LIMIT_EXCEEDED');
  });

  it('refuses a corrupt persisted version', async () => {
    const corrupt: PersistedRoomInventory = { roomId: context.roomId, propertyId: context.propertyId, ownerId, version: 0, items: [], createdAt: new Date(), updatedAt: new Date() };
    await expect(codeOf(() => readInventory(context.roomId, context.propertyId, corrupt))).resolves.toBe('DEPENDENCY_UNAVAILABLE');
  });
});

describe('GetRoomInventoryUseCase', () => {
  const rooms: jest.Mocked<RoomContextPort> = { getContext: jest.fn<Promise<RoomContext>, [string, string]>(async () => context) };
  const repository = { findByRoomId: jest.fn<Promise<PersistedRoomInventory | null>, [string]>(async () => null) };
  const useCase = new GetRoomInventoryUseCase(rooms, repository);
  beforeEach(() => { rooms.getContext.mockClear(); repository.findByRoomId.mockClear(); });

  it('returns the synthetic empty inventory for the owner without persisting anything', async () => {
    await expect(useCase.execute({ viewer: { userId: ownerId, role: 'OWNER' }, roomId: context.roomId, traceId: 't' })).resolves.toMatchObject({ version: 0, items: [] });
    expect(rooms.getContext).toHaveBeenCalledWith(context.roomId, 't');
  });

  it('returns persisted active and inactive items for ADMIN', async () => {
    repository.findByRoomId.mockResolvedValueOnce({ roomId: context.roomId, propertyId: context.propertyId, ownerId, version: 3, items: [item('x', '2031-01-01T00:00:00Z', false)], createdAt: new Date(), updatedAt: new Date() });
    const result = await useCase.execute({ viewer: { userId: randomUUID(), role: 'ADMIN' }, roomId: context.roomId, traceId: 't' });
    expect(result).toMatchObject({ version: 3, items: [{ id: 'x', active: false }] });
  });

  it.each([
    ['another owner', { userId: randomUUID(), role: 'OWNER' as const }],
    ['a guest', { userId: ownerId, role: 'GUEST' as const }],
  ])('forbids %s and never reads local data', async (_name, viewer) => {
    await expect(codeOf(() => useCase.execute({ viewer, roomId: context.roomId, traceId: 't' }))).resolves.toBe('FORBIDDEN');
    expect(repository.findByRoomId).not.toHaveBeenCalled();
  });

  it.each(['ROOM_NOT_FOUND', 'DEPENDENCY_UNAVAILABLE'] as const)('propagates %s from Accommodations without a local fallback', async (code) => {
    rooms.getContext.mockRejectedValueOnce(new InventoryError(code));
    await expect(codeOf(() => useCase.execute({ viewer: { userId: randomUUID(), role: 'ADMIN' }, roomId: context.roomId, traceId: 't' }))).resolves.toBe(code);
    expect(repository.findByRoomId).not.toHaveBeenCalled();
  });
});
