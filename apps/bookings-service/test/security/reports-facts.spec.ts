import { generateKeyPairSync } from 'node:crypto';
import { importPKCS8, SignJWT } from 'jose';
import { ReportFactsController, ReportsFactsGuard } from '../../src/interfaces/http/internal/report-facts.controller';
import { ServiceJwtVerifier } from '../../src/infrastructure/security/service-jwt.verifier';
import { ReportsBookingFactsQuery } from '../../src/infrastructure/persistence/prisma/reports-facts.query';
import type { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import type { BookingsConfig } from '../../src/infrastructure/config/bookings-config';

describe('Reports source authorization and privacy', () => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const config = { jwtIssuer:'test', jwtAudience:'bookings', jwtPublicKeys: { reports: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString() } } as unknown as BookingsConfig;
  const guard = new ReportsFactsGuard(new ServiceJwtVerifier(config), config);
  async function context(subject = 'reports-service', scope = 'reports:read') {
    const key = await importPKCS8(pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), 'RS256');
    const token = await new SignJWT({ scope }).setProtectedHeader({ alg: 'RS256', kid: 'reports' }).setIssuer('test').setAudience('bookings').setSubject(subject).setIssuedAt().setExpirationTime('60s').sign(key);
    return { switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer ' + token } }) }) } as never;
  }
  it('accepts only reports subject with dedicated scope', async () => {
    await expect(guard.canActivate(await context())).resolves.toBe(true);
    await expect(guard.canActivate(await context('bookings-service'))).rejects.toThrow();
    await expect(guard.canActivate(await context('reports-service', 'bookings:invoke'))).rejects.toThrow();
  });
  it('denies anonymous source reads', async () => { await expect(guard.canActivate({ switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }) } as never)).rejects.toThrow(); });
  it('scopes facts by owner and never returns guest identity', async () => {
    const ownerId = '11111111-1111-4111-8111-111111111111';
    const findMany = jest.fn().mockResolvedValue([{ id: ownerId, ownerId, propertyId: ownerId, roomId: ownerId, status: 'CONFIRMED', createdAt: new Date('2026-11-01'), cancelledAt: null, checkIn: new Date('2026-11-03'), checkOut: new Date('2026-11-07') }]);
    const query = new ReportsBookingFactsQuery({ booking: { findMany } } as unknown as PrismaService);
    const controller = new ReportFactsController(query);
    const result = await controller.list({ ownerId });
    expect(findMany.mock.calls[0]?.[0].where.ownerId).toBe(ownerId);
    expect(JSON.stringify(result)).not.toMatch(/guestId|email|cancellationReason/);
    expect(result).toMatchObject({ nextCursor: null, items: [{ checkIn: '2026-11-03', checkOut: '2026-11-07' }] });
    await expect(controller.list({ ownerId: 'invalid' })).rejects.toThrow();
    await expect(controller.list({ ownerId, limit: ['200'] })).rejects.toThrow();
  });
});
