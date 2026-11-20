/** Stable, framework-free error codes. HTTP mapping lives in interfaces/http/problem.filter.ts. */
export type InventoryErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNKNOWN_ITEM'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'ROOM_NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'INVENTORY_LIMIT_EXCEEDED'
  | 'DEPENDENCY_UNAVAILABLE';

export class InventoryError extends Error {
  public constructor(public readonly code: InventoryErrorCode, public readonly field?: string) {
    super(field ? `${code}:${field}` : code);
    this.name = 'InventoryError';
  }
}

export function invalid(field: string): never {
  throw new InventoryError('VALIDATION_ERROR', field);
}
