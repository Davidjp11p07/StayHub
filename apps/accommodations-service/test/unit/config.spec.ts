import { generateKeyPairSync } from 'node:crypto';
import { loadAccommodationsConfig } from '../../src/infrastructure/config/accommodations-config';

const publicKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' }).toString();
const validEnv = {
  ACCOMMODATIONS_PORT: '3003',
  ACCOMMODATIONS_JWT_PUBLIC_KEY: publicKey,
  ACCOMMODATIONS_JWT_KID: 'access-v1',
  ACCOMMODATIONS_JWT_ISSUER: 'stayhub-auth',
  ACCOMMODATIONS_JWT_AUDIENCE: 'stayhub-api',
};

describe('accommodations configuration', () => {
  it('accepts port 3003 and a public-key JWT configuration', () => {
    expect(loadAccommodationsConfig(validEnv)).toMatchObject({ port: 3003, jwt: { kid: 'access-v1', issuer: 'stayhub-auth', audience: 'stayhub-api' } });
  });

  it('fails fast when the service port is absent', () => {
    expect(() => loadAccommodationsConfig({ ...validEnv, ACCOMMODATIONS_PORT: '' })).toThrow();
  });

  it.each(['ACCOMMODATIONS_JWT_KID', 'ACCOMMODATIONS_JWT_ISSUER', 'ACCOMMODATIONS_JWT_AUDIENCE'])('fails fast when %s is absent', (key) => {
    expect(() => loadAccommodationsConfig({ ...validEnv, [key]: '' })).toThrow();
  });

  it('requires exactly one JWT key source: public key or JWKS URI', () => {
    expect(() => loadAccommodationsConfig({ ...validEnv, ACCOMMODATIONS_JWT_PUBLIC_KEY: '', ACCOMMODATIONS_JWKS_URI: '' })).toThrow();
    expect(() => loadAccommodationsConfig({ ...validEnv, ACCOMMODATIONS_JWKS_URI: 'https://auth.example.test/.well-known/jwks.json' })).toThrow();
    expect(loadAccommodationsConfig({ ...validEnv, ACCOMMODATIONS_JWT_PUBLIC_KEY: '', ACCOMMODATIONS_JWKS_URI: 'https://auth.example.test/.well-known/jwks.json' }).jwt.jwksUri).toBe('https://auth.example.test/.well-known/jwks.json');
  });

  it('rejects unsupported ports and malformed JWT source URLs', () => {
    expect(() => loadAccommodationsConfig({ ...validEnv, ACCOMMODATIONS_PORT: '3002' })).toThrow();
    expect(() => loadAccommodationsConfig({ ...validEnv, ACCOMMODATIONS_JWT_PUBLIC_KEY: '', ACCOMMODATIONS_JWKS_URI: 'file:///tmp/jwks.json' })).toThrow();
  });
});
