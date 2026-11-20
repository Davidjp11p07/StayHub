import { Inject, Injectable } from '@nestjs/common';
import { SignJWT, importPKCS8 } from 'jose';
import { readFileSync } from 'node:fs';
import type { ServiceTokenPort } from '@reviews/application/ports/service-token.port';
import { DomainError } from '@reviews/domain/shared/domain-error';
import { REVIEWS_CONFIG } from '@reviews/infrastructure/config/config.module';
import type { ReviewsConfig } from '@reviews/infrastructure/config/reviews-config';

@Injectable()
export class EnvironmentServiceTokenProvider implements ServiceTokenPort {
  public constructor(@Inject(REVIEWS_CONFIG) private readonly config: ReviewsConfig) {}
  public async getToken(): Promise<string> {
    try {
      if (this.config.eligibilityKeyFile) {
        const key = await importPKCS8(readFileSync(this.config.eligibilityKeyFile, 'utf8'), 'RS256');
        return await new SignJWT({ scope: 'reviews:eligibility' }).setProtectedHeader({ alg: 'RS256', kid: 'reviews-eligibility-v1' })
          .setIssuer('stayhub-reviews-service').setSubject('reviews-service').setAudience('stayhub-bookings-service')
          .setIssuedAt().setExpirationTime('240s').sign(key);
      }
      const token = this.config.bookingsServiceTokenFile ? readFileSync(this.config.bookingsServiceTokenFile, 'utf8').trim() : this.config.bookingsServiceToken?.trim();
      if (!token) throw new DomainError('SERVICE_CREDENTIALS_UNAVAILABLE');
      return Promise.resolve(token);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError('SERVICE_CREDENTIALS_UNAVAILABLE');
    }
  }
}
