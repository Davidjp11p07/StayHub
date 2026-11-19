import { Inject, Injectable, SetMetadata, UnauthorizedException, type CanActivate, type CustomDecorator, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACCOMMODATIONS_CONFIG, type AccommodationsConfig } from '@accommodations/infrastructure/config/accommodations-config';
import { verifyServiceToken } from '@accommodations/infrastructure/security/service-jwt.verifier';
import { bearerToken, type AuthenticatedRequest } from './jwt.strategy';

export const SERVICE_SCOPE_KEY = 'accommodations:service-scope';

/** Declares the exact internal scope an endpoint accepts; without it the legacy booking-quote scope applies. */
export const ServiceScope = (scope: string): CustomDecorator<string> => SetMetadata(SERVICE_SCOPE_KEY, scope);

@Injectable()
export class ServiceAuthGuard implements CanActivate {
  constructor(
    @Inject(ACCOMMODATIONS_CONFIG) private readonly config: AccommodationsConfig,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request);
    if (token === undefined) throw new UnauthorizedException();
    const requiredScope = this.reflector.getAllAndOverride<unknown>(SERVICE_SCOPE_KEY, [context.getHandler(), context.getClass()]);
    try {
      verifyServiceToken(token, this.config, typeof requiredScope === 'string' ? requiredScope : this.config.serviceJwt.scope);
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
