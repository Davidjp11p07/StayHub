import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { importPKCS8, SignJWT } from 'jose';
import type { ServiceTokenPort } from '@bookings/application/ports/service-token.port';
import { DomainError } from '@bookings/domain/shared/domain-error';

function optionalToken(name: string): string | undefined {
  const file = process.env[`${name}_FILE`]?.trim();
  try {
    const token = file ? readFileSync(file, 'utf8').trim() : process.env[name]?.trim();
    return token || undefined;
  } catch {
    return undefined;
  }
}

function requiredToken(name: string): string {
  const token = optionalToken(name);
  if (!token) throw new DomainError('SERVICE_CREDENTIALS_UNAVAILABLE');
  return token;
}

function tokenMap(): Readonly<Record<string, string>> {
  const file = process.env.BOOKINGS_OUTBOUND_SERVICE_TOKENS_JSON_FILE?.trim();
  let raw: string | undefined;
  try {
    raw = (file ? readFileSync(file, 'utf8') : process.env.BOOKINGS_OUTBOUND_SERVICE_TOKENS_JSON)?.trim();
  } catch {
    throw new DomainError('SERVICE_CREDENTIALS_UNAVAILABLE');
  }
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.some(([key, value]) => !key || typeof value !== 'string')) throw new Error();
    return parsed as Record<string, string>;
  } catch {
    throw new DomainError('SERVICE_CREDENTIALS_UNAVAILABLE');
  }
}

@Injectable()
export class EnvironmentServiceTokenProvider implements ServiceTokenPort {
  public getToken(audience: string, scope: string): Promise<string> {
    const signingFile = process.env.BOOKINGS_OUTBOUND_PRIVATE_KEY_FILE;
    if (signingFile) return this.sign(signingFile, audience, scope);
    const dedicated = /notifications/iu.test(audience) ? optionalToken('BOOKINGS_NOTIFICATIONS_SERVICE_TOKEN') : undefined;
    const map = tokenMap();
    const mapped = map[`${audience}:${scope}`] ?? map[audience] ?? map[scope];
    return Promise.resolve(dedicated ?? mapped ?? requiredToken('BOOKINGS_OUTBOUND_SERVICE_TOKEN'));
  }

  private async sign(file: string, audience: string, scope: string): Promise<string> {
    const destinations: Record<string, [string, string]> = {
      'accommodations-service:accommodations:booking-quote': ['stayhub-accommodations-service', 'bookings-accommodations-2026-01'],
      'payments-service:payments:charge': ['stayhub-payments-service', 'bookings-payments-2026-01'],
      'payments-service:payments:refund': ['stayhub-payments-service', 'bookings-payments-2026-01'],
      'stayhub-notifications-service:notifications:send': ['stayhub-notifications-service', 'bookings-notifications-2026-01'],
    };
    const destination = destinations[`${audience}:${scope}`];
    if (!destination) throw new DomainError('SERVICE_CREDENTIALS_UNAVAILABLE');
    try {
      const key = await importPKCS8(readFileSync(file, 'utf8'), 'RS256');
      return await new SignJWT({ scope }).setProtectedHeader({ alg: 'RS256', kid: destination[1], typ: 'JWT' })
        .setIssuer('stayhub-bookings-service').setSubject('bookings-service').setAudience(destination[0])
        .setIssuedAt().setExpirationTime('240s').sign(key);
    } catch {
      throw new DomainError('SERVICE_CREDENTIALS_UNAVAILABLE');
    }
  }
}
