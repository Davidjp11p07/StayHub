import { decode, verify } from 'jsonwebtoken';
import type { AccommodationsConfig, ServiceCallerConfig } from '../config/accommodations-config';

export class InvalidServiceTokenError extends Error {
  constructor() { super('INVALID_SERVICE_TOKEN'); }
}

export interface ServicePrincipal {
  sub: string;
  scopes: readonly string[];
}

const MAX_AGE_SECONDS = 300;

function callersOf(config: Pick<AccommodationsConfig, 'serviceJwt' | 'serviceJwtCallers'>): readonly ServiceCallerConfig[] {
  return config.serviceJwtCallers.length > 0
    ? config.serviceJwtCallers
    : [{ issuer: config.serviceJwt.issuer, kid: config.serviceJwt.kid, publicKey: config.serviceJwt.publicKey, scopes: [config.serviceJwt.scope] }];
}

/**
 * Fail-closed RS256 service-token verification. The caller is selected by exact `iss` + `kid`; the token must be
 * signed with that caller's key, target the shared service audience and carry the exact scope the route requires.
 * A caller trusted for Booking Quote cannot invoke Inventory Context, and vice versa.
 */
export function verifyServiceToken(
  token: string,
  config: Pick<AccommodationsConfig, 'serviceJwt' | 'serviceJwtCallers'>,
  requiredScope: string = config.serviceJwt.scope,
  now: number = Math.floor(Date.now() / 1000),
): ServicePrincipal {
  let claims: Record<string, unknown>;
  let caller: ServiceCallerConfig | undefined;
  try {
    const decoded = decode(token, { complete: true });
    if (!decoded || decoded.header.alg !== 'RS256' || typeof decoded.header.kid !== 'string') throw new Error();
    const issuer = typeof decoded.payload === 'object' && decoded.payload !== null ? (decoded.payload as { iss?: unknown }).iss : undefined;
    if (typeof issuer !== 'string') throw new Error();
    caller = callersOf(config).find((candidate) => candidate.issuer === issuer && candidate.kid === decoded.header.kid);
    if (!caller) throw new Error();
    const verified = verify(token, caller.publicKey, {
      algorithms: ['RS256'],
      issuer: caller.issuer,
      audience: config.serviceJwt.audience,
      clockTimestamp: now,
    });
    if (typeof verified === 'string') throw new Error();
    claims = verified as Record<string, unknown>;
  } catch {
    throw new InvalidServiceTokenError();
  }

  const { iat, exp, sub, scope } = claims;
  if (
    typeof iat !== 'number' || typeof exp !== 'number' ||
    !Number.isInteger(iat) || !Number.isInteger(exp) ||
    iat > now || exp <= now || exp <= iat || now - iat > MAX_AGE_SECONDS
  ) {
    throw new InvalidServiceTokenError();
  }
  if (typeof sub !== 'string' || sub.trim().length === 0 || typeof scope !== 'string') throw new InvalidServiceTokenError();
  if (!caller.scopes.includes(requiredScope)) throw new InvalidServiceTokenError();
  const scopes = scope.split(/\s+/u).filter(Boolean);
  if (!scopes.includes(requiredScope)) throw new InvalidServiceTokenError();
  return { sub, scopes };
}
