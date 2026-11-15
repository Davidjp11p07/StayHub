import { decodeProtectedHeader, importSPKI, jwtVerify } from 'jose';

import { OutboundServiceTokenProvider } from '@inventory/infrastructure/security/outbound-service-token.provider';

import { inventoryKeys, testConfig } from '../fixtures/jwt.fixture';

describe('OutboundServiceTokenProvider (Inventory -> Accommodations)', () => {
  const config = testConfig();
  const provider = new OutboundServiceTokenProvider(config);

  it('signs RS256 with Inventory\'s own kid and the exact audience, issuer, subject and scope', async () => {
    const token = await provider.issue();
    expect(decodeProtectedHeader(token)).toEqual({ alg: 'RS256', kid: 'room-inventory-test-2026-01', typ: 'JWT' });
    const { payload } = await jwtVerify(token, await importSPKI(inventoryKeys.publicKey, 'RS256'), {
      issuer: 'stayhub-room-inventory-service',
      audience: 'stayhub-accommodations-service',
      subject: 'stayhub-room-inventory-service',
    });
    expect(payload.scope).toBe('accommodations:inventory-context');
    expect(typeof payload.jti).toBe('string');
  });

  it('never requests the Booking Quote scope', async () => {
    const { payload } = await jwtVerify(await provider.issue(), await importSPKI(inventoryKeys.publicKey, 'RS256'));
    expect(String(payload.scope).split(' ')).toEqual(['accommodations:inventory-context']);
  });

  it('issues short-lived tokens (<= configured TTL and within Accommodations\' 300 s age limit)', async () => {
    const { payload } = await jwtVerify(await provider.issue(), await importSPKI(inventoryKeys.publicKey, 'RS256'));
    const now = Math.floor(Date.now() / 1000);
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(60);
    expect(Math.abs((payload.iat ?? 0) - now)).toBeLessThanOrEqual(2);
  });

  it('issues a fresh token (new jti) for every call', async () => {
    const [a, b] = [await provider.issue(), await provider.issue()];
    const key = await importSPKI(inventoryKeys.publicKey, 'RS256');
    const [pa, pb] = [(await jwtVerify(a, key)).payload, (await jwtVerify(b, key)).payload];
    expect(pa.jti).not.toBe(pb.jti);
  });

  it('honours a custom TTL', async () => {
    const short = new OutboundServiceTokenProvider(testConfig({ outbound: { ...config.outbound, ttlSeconds: 15 } }));
    const { payload } = await jwtVerify(await short.issue(), await importSPKI(inventoryKeys.publicKey, 'RS256'));
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(15);
  });
});
