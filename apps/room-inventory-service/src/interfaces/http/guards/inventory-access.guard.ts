import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';

import { InventoryError } from '@inventory/domain/inventory-errors';

import { principalOf, type AuthenticatedRequest } from './service-auth.guard';

/**
 * Role gate: OWNER or ADMIN. Ownership (OWNER manages only its own rooms) needs the authoritative Accommodations
 * context, so it is decided in the application layer (`assertCanManageRoom`).
 */
@Injectable()
export class InventoryAccessGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const principal = principalOf(context.switchToHttp().getRequest<AuthenticatedRequest>());
    if (principal.role !== 'OWNER' && principal.role !== 'ADMIN') throw new InventoryError('FORBIDDEN');
    return true;
  }
}
