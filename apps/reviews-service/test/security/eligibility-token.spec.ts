import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jwtVerify } from 'jose';
import { EnvironmentServiceTokenProvider } from '@reviews/infrastructure/security/environment-service-token.provider';
import type { ReviewsConfig } from '@reviews/infrastructure/config/reviews-config';

it('signs a fresh eligibility credential after expiry and fails closed if the key is removed', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'reviews-signing-'));
  const file = join(directory, 'signing.pem');
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  writeFileSync(file, keys.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const provider = new EnvironmentServiceTokenProvider({ eligibilityKeyFile: file } as ReviewsConfig);
  jest.useFakeTimers();
  try {
    const options = { issuer: 'stayhub-reviews-service', audience: 'stayhub-bookings-service', algorithms: ['RS256'] };
    const first = await provider.getToken();
    const { payload, protectedHeader } = await jwtVerify(first, keys.publicKey, options);
    expect(protectedHeader.kid).toBe('reviews-eligibility-v1');
    expect(payload).toMatchObject({ sub: 'reviews-service', scope: 'reviews:eligibility' });
    expect(payload.exp! - payload.iat!).toBe(240);
    jest.setSystemTime(Date.now() + 241_000);
    await expect(jwtVerify(first, keys.publicKey, options)).rejects.toMatchObject({ code: 'ERR_JWT_EXPIRED' });
    await expect(jwtVerify(await provider.getToken(), keys.publicKey, options)).resolves.toBeDefined();
  } finally {
    jest.useRealTimers();
    unlinkSync(file);
    rmdirSync(directory);
  }
  await expect(provider.getToken()).rejects.toMatchObject({ code: 'SERVICE_CREDENTIALS_UNAVAILABLE' });
});
