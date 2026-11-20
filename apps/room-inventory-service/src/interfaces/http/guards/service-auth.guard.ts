import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { InventoryError } from '@inventory/domain/inventory-errors';
import type { InventoryPrincipal } from '@inventory/infrastructure/security/inventory-principal';
import { ServiceJwtVerifier } from '@inventory/infrastructure/security/service-jwt.verifier';

export interface AuthenticatedRequest extends Request {
  principal?: InventoryPrincipal;
  traceId?: string;
}

/**
 * Requires a valid delegated JWT. Identity headers (`x-user-id`, `x-role`, `x-owner-id`, …) are never read:
 * the principal comes exclusively from the verified token.
 */
@Injectable()
export class ServiceAuthGuard implements CanActivate {
  public constructor(private readonly verifier: ServiceJwtVerifier) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (typeof header !== 'string' || !/^Bearer [A-Za-z0-9._-]+$/u.test(header)) throw new InventoryError('UNAUTHENTICATED');
    request.principal = await this.verifier.verify(header.slice('Bearer '.length));
    return true;
  }
}

export function principalOf(request: AuthenticatedRequest): InventoryPrincipal {
  if (!request.principal) throw new InventoryError('UNAUTHENTICATED');
  return request.principal;
}
