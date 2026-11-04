import { createPublicKey } from 'node:crypto';

export interface JwtConfig {
  kid: string;
  issuer: string;
  audience: string;
  publicKey?: string;
  jwksUri?: string;
}

export interface AccommodationsConfig {
  port: number;
  jwt: JwtConfig;
}

export const ACCOMMODATIONS_CONFIG = Symbol('ACCOMMODATIONS_CONFIG');

export function loadAccommodationsConfig(env: NodeJS.ProcessEnv = process.env): AccommodationsConfig {
  const required = (key: string): string => {
    const value = env[key];
    if (!value?.trim()) throw new Error(`Missing configuration: ${key}`);
    return value.trim();
  };

  const port = Number(required('ACCOMMODATIONS_PORT'));
  if (!Number.isInteger(port) || port !== 3003) throw new Error('Invalid configuration: ACCOMMODATIONS_PORT');

  const publicKeyValue = env.ACCOMMODATIONS_JWT_PUBLIC_KEY?.replace(/\\n/g, '\n').trim();
  const jwksUriValue = env.ACCOMMODATIONS_JWKS_URI?.trim();
  if (Boolean(publicKeyValue) === Boolean(jwksUriValue)) {
    throw new Error('Configure exactly one of ACCOMMODATIONS_JWT_PUBLIC_KEY or ACCOMMODATIONS_JWKS_URI');
  }

  const jwt: JwtConfig = {
    kid: required('ACCOMMODATIONS_JWT_KID'),
    issuer: required('ACCOMMODATIONS_JWT_ISSUER'),
    audience: required('ACCOMMODATIONS_JWT_AUDIENCE'),
  };

  if (publicKeyValue) {
    try {
      if (publicKeyValue.includes('PRIVATE KEY')) throw new Error();
      const key = createPublicKey(publicKeyValue);
      if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error();
    } catch {
      throw new Error('Invalid configuration: ACCOMMODATIONS_JWT_PUBLIC_KEY');
    }
    jwt.publicKey = publicKeyValue;
  } else if (jwksUriValue) {
    try {
      if (new URL(jwksUriValue).protocol !== 'https:') throw new Error();
    } catch {
      throw new Error('Invalid configuration: ACCOMMODATIONS_JWKS_URI');
    }
    jwt.jwksUri = jwksUriValue;
  }

  return { port, jwt };
}
