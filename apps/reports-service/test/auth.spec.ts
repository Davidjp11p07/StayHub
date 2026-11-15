import { authenticate } from '../src/infrastructure/auth';
import { createSign } from 'node:crypto';
import { config, owner, token } from './support';
describe('Reports JWT boundary', () => {
  test('accepts owner, admin and delegated identities', () => {
    expect(authenticate(token(), config)).toEqual({ sub: owner, role: 'OWNER' });
    expect(authenticate(token('ADMIN'), config).role).toBe('ADMIN');
    expect(authenticate(token('OWNER', owner, {}, true), config).sub).toBe(owner);
  });
  test.each(['', 'malformed', 'a.b.c'])('rejects malformed token %s', value => expect(() => authenticate(value, config)).toThrow());
  test.each([{ exp: 1 }, { iat: Math.floor(Date.now() / 1000) + 30 }, { exp: Math.floor(Date.now() / 1000) + 1000 }, { aud: 'wrong' }, { iss: 'wrong' }, { sub: 'invalid' }, { role: 'GUEST' }])('rejects invalid claims %j', claims => expect(() => authenticate(token('OWNER', owner, claims), config)).toThrow());
  test('requires the dedicated delegated scope', () => expect(() => authenticate(token('OWNER', owner, { scope: 'bookings:invoke' }, true), config)).toThrow());
  test('rejects signed duplicate claims, including escaped duplicate keys', () => {
    const now = Math.floor(Date.now() / 1000);
    for (const duplicate of ['"role":"GUEST","role":"OWNER"', '"role":"GUEST","\\u0072ole":"OWNER"']) {
      const header = Buffer.from('{"alg":"RS256","kid":"test"}').toString('base64url');
      const body = Buffer.from(`{"sub":"${owner}",${duplicate},"iss":"test-auth","aud":"test-api","iat":${now},"exp":${now + 60}}`).toString('base64url');
      const input = header + '.' + body;
      const value = input + '.' + createSign('RSA-SHA256').update(input).sign(config.targets.bookings.jwt.key).toString('base64url');
      expect(() => authenticate(value, config)).toThrow();
    }
  });
});
