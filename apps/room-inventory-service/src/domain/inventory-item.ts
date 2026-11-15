import { invalid } from './inventory-errors';

export const INVENTORY_ITEM_TYPES = ['PRODUCT', 'SERVICE'] as const;
export type InventoryItemType = (typeof INVENTORY_ITEM_TYPES)[number];

export const NAME_MAX_LENGTH = 120;
export const QUANTITY_MAX = 1_000_000;

/** Writable fields of an item. `quantityAvailable = 0` means no availability; `active = false` means withdrawn. */
export interface InventoryItemProps {
  readonly type: InventoryItemType;
  readonly name: string;
  readonly quantityAvailable: number;
  readonly active: boolean;
}

export interface InventoryItem extends InventoryItemProps {
  readonly id: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Trims and collapses internal whitespace; the result must have 1..120 characters. */
export function normalizeName(value: unknown): string {
  if (typeof value !== 'string') return invalid('name');
  const name = value.trim().replace(/\s+/gu, ' ');
  if (name.length < 1 || name.length > NAME_MAX_LENGTH) return invalid('name');
  return name;
}

export function parseItemType(value: unknown): InventoryItemType {
  if (typeof value !== 'string' || !(INVENTORY_ITEM_TYPES as readonly string[]).includes(value)) return invalid('type');
  return value as InventoryItemType;
}

export function parseQuantity(value: unknown, max: number = QUANTITY_MAX): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > Math.min(max, QUANTITY_MAX)) return invalid('quantityAvailable');
  return value;
}

export function parseActive(value: unknown): boolean {
  if (typeof value !== 'boolean') return invalid('active');
  return value;
}

/** Validates and normalizes the writable fields; throws VALIDATION_ERROR naming the first invalid field. */
export function createItemProps(input: { type: unknown; name: unknown; quantityAvailable: unknown; active: unknown }, maxQuantity: number = QUANTITY_MAX): InventoryItemProps {
  return {
    type: parseItemType(input.type),
    name: normalizeName(input.name),
    quantityAvailable: parseQuantity(input.quantityAvailable, maxQuantity),
    active: parseActive(input.active),
  };
}
