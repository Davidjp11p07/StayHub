import { InventoryError } from '@inventory/domain/inventory-errors';

import { Prisma } from '../generated/client';

/** Prisma codes that mean a write lost a race; callers translate them to VERSION_CONFLICT (409). */
const CONFLICT_CODES = new Set(['P2034', 'P2002', 'P2025']);

/**
 * Safe mapping: domain errors pass through; write races become VERSION_CONFLICT; anything else (connection,
 * timeout, unknown) becomes DEPENDENCY_UNAVAILABLE. Database messages, SQL and values never reach the caller.
 */
export function toInventoryError(error: unknown): InventoryError {
  if (error instanceof InventoryError) return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && CONFLICT_CODES.has(error.code)) return new InventoryError('VERSION_CONFLICT');
  return new InventoryError('DEPENDENCY_UNAVAILABLE');
}
