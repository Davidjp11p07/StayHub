import type { JWTPayload } from 'jose';

import type { InventoryRole, InventoryViewer } from '@inventory/application/use-cases/inventory-viewer';
import { InventoryError } from '@inventory/domain/inventory-errors';

const ROLES: readonly InventoryRole[] = ['OWNER', 'ADMIN', 'GUEST'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Verified caller. Identity comes only from signed claims, never from request headers or parameters. */
export type InventoryPrincipal = InventoryViewer;

export function toInventoryPrincipal(payload: JWTPayload): InventoryPrincipal {
  const role = payload.role;
  if (typeof payload.sub !== 'string' || !UUID.test(payload.sub)) throw new InventoryError('UNAUTHENTICATED');
  if (typeof role !== 'string' || !(ROLES as readonly string[]).includes(role)) throw new InventoryError('UNAUTHENTICATED');
  return { userId: payload.sub.toLowerCase(), role: role as InventoryRole };
}
