import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import type { Request } from 'express';
import { ServiceJwtVerifier, type ServicePrincipal } from '@bookings/infrastructure/security/service-jwt.verifier';
import type { BookingsConfig } from '@bookings/infrastructure/config/bookings-config';
import { BOOKINGS_CONFIG } from '@bookings/infrastructure/config/config.module';

export interface ReviewAuthenticatedRequest extends Request { principal?: ServicePrincipal; }

@Injectable()
export class ReviewServiceGuard implements CanActivate {
  private readonly verifier: ServiceJwtVerifier;
  private readonly keyFile = process.env.REVIEWS_ELIGIBILITY_PUBLIC_KEY_FILE;
  public constructor(verifier: ServiceJwtVerifier, @Inject(BOOKINGS_CONFIG) private readonly config: BookingsConfig) {
    this.verifier = this.keyFile ? new ServiceJwtVerifier({ ...config, jwtIssuer: 'stayhub-reviews-service', jwtPublicKeys: { 'reviews-eligibility-v1': readFileSync(this.keyFile, 'utf8') } }) : verifier;
  }
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ReviewAuthenticatedRequest>();
    const value = request.headers.authorization;
    if (!value?.startsWith('Bearer ') || value.length <= 7) throw new UnauthorizedException('Bearer token required');
    request.principal = await this.verifier.verify(value.slice(7), { scope: this.config.reviewEligibilityScope, audience: this.config.reviewEligibilityAudience });
    const { sub, claims } = request.principal;
    if (this.keyFile && (sub !== 'reviews-service' || claims.scope !== this.config.reviewEligibilityScope || typeof claims.iat !== 'number' || typeof claims.exp !== 'number' || claims.exp - claims.iat > 240)) throw new UnauthorizedException();
    return true;
  }
}
