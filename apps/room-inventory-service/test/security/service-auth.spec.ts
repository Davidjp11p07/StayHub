import { randomUUID } from 'node:crypto';

import type { ExecutionContext } from '@nestjs/common';

import { assertCanManageRoom } from '@inventory/application/use-cases/inventory-viewer';
import { InventoryError } from '@inventory/domain/inventory-errors';
import { ServiceJwtVerifier } from '@inventory/infrastructure/security/service-jwt.verifier';
import { InventoryAccessGuard } from '@inventory/interfaces/http/guards/inventory-access.guard';
import { ServiceAuthGuard, type AuthenticatedRequest } from '@inventory/interfaces/http/guards/service-auth.guard';

import { delegatedToken, testConfig } from '../fixtures/jwt.fixture';

const verifier = new ServiceJwtVerifier(testConfig());

async function codeOf(action: () => unknown): Promise<string | undefined> {
  try {
    await action();
  } catch (error) {
    if (error instanceof InventoryError) return error.code;
    throw error;
  }
  return undefined;
}

function contextFor(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('delegated JWT verification', () => {
  it('accepts RS256 with the expected kid, issuer, audience, scope inventory:manage and role', async () => {
    const sub = randomUUID();
    await expect(verifier.verify(await delegatedToken({ sub, role: 'OWNER' }))).resolves.toEqual({ userId: sub, role: 'OWNER' });
  });

  it.each([
    ['an unknown kid', { kid: 'other-kid' }],
    ['a token signed by another key', { wrongKey: true }],
    ['the wrong issuer', { issuer: 'someone-else' }],
    ['the audience of another service', { audience: 'stayhub-bookings-service' }],
    ['another scope', { scope: 'reports:read' }],
    ['no scope', { scope: null }],
    ['an expired token', { expiresInSeconds: -60 }],
    ['an iat in the future', { issuedAtOffsetSeconds: 120, expiresInSeconds: 300 }],
    ['no role claim', { role: null }],
    ['an unknown role', { role: 'SUPERUSER' }],
    ['a non-UUID subject', { sub: 'owner-1' }],
  ])('rejects %s as UNAUTHENTICATED', async (_name, options) => {
    await expect(codeOf(async () => verifier.verify(await delegatedToken(options)))).resolves.toBe('UNAUTHENTICATED');
  });

  it.each(['', 'abc', 'eyJhbGciOiJub25lIn0.e30.', 'eyJhbGciOiJIUzI1NiIsImtpZCI6ImsifQ.e30.c2ln'])('rejects malformed or non-RS256 token %p', async (token) => {
    await expect(codeOf(() => verifier.verify(token))).resolves.toBe('UNAUTHENTICATED');
  });
});

describe('ServiceAuthGuard', () => {
  const guard = new ServiceAuthGuard(verifier);

  it('derives the principal from the token and ignores spoofed identity headers', async () => {
    const sub = randomUUID();
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: `Bearer ${await delegatedToken({ sub, role: 'OWNER' })}`, 'x-user-id': randomUUID(), 'x-role': 'ADMIN', 'x-owner-id': randomUUID() },
    };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.principal).toEqual({ userId: sub, role: 'OWNER' });
  });

  it.each([
    ['no Authorization header', {}],
    ['a non-bearer scheme', { authorization: 'Basic dXNlcjpwYXNz' }],
    ['an empty bearer', { authorization: 'Bearer ' }],
    ['only identity headers', { 'x-user-id': randomUUID(), 'x-role': 'ADMIN' }],
  ])('rejects %s with UNAUTHENTICATED', async (_name, headers) => {
    await expect(codeOf(() => guard.canActivate(contextFor({ headers })))).resolves.toBe('UNAUTHENTICATED');
  });
});

describe('role gate and ownership policy', () => {
  const guard = new InventoryAccessGuard();
  const ownerId = randomUUID();
  const context = { roomId: randomUUID(), propertyId: randomUUID(), ownerId, propertyStatus: 'PUBLISHED' as const };

  it.each(['OWNER', 'ADMIN'] as const)('lets %s reach inventory routes', (role) => {
    expect(guard.canActivate(contextFor({ principal: { userId: ownerId, role } }))).toBe(true);
  });

  it('forbids GUEST and requires a principal', async () => {
    await expect(codeOf(() => guard.canActivate(contextFor({ principal: { userId: ownerId, role: 'GUEST' } })))).resolves.toBe('FORBIDDEN');
    await expect(codeOf(() => guard.canActivate(contextFor({})))).resolves.toBe('UNAUTHENTICATED');
  });

  it('OWNER manages only rooms whose authoritative ownerId is its own (case-insensitive UUID)', async () => {
    expect(() => assertCanManageRoom({ userId: ownerId, role: 'OWNER' }, { ...context, ownerId: ownerId.toUpperCase() })).not.toThrow();
    await expect(codeOf(() => assertCanManageRoom({ userId: randomUUID(), role: 'OWNER' }, context))).resolves.toBe('FORBIDDEN');
  });

  it('ADMIN manages any room; GUEST never, even if it is the owner', async () => {
    expect(() => assertCanManageRoom({ userId: randomUUID(), role: 'ADMIN' }, context)).not.toThrow();
    await expect(codeOf(() => assertCanManageRoom({ userId: ownerId, role: 'GUEST' }, context))).resolves.toBe('FORBIDDEN');
  });
});
