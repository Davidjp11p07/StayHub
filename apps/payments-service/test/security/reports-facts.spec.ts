import { generateKeyPairSync } from 'node:crypto';
import { sign } from 'jsonwebtoken';
import { ReportsMovementsGuard } from '../../src/interfaces/http/reports-facts.controller';
import { ReportsPaymentFactsQuery } from '../../src/infrastructure/persistence/prisma/reports-facts.query';
import type { PaymentsConfig } from '../../src/infrastructure/config/payments-config';
import type { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const config = { serviceJwt: { issuer: 'test', audience: 'payments', kid: 'reports', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString() } } as PaymentsConfig;
function context(subject = 'reports-service', scope = 'reports:read'): Parameters<ReportsMovementsGuard['canActivate']>[0] {
  const value = sign({ scope }, keys.privateKey, { algorithm: 'RS256', keyid: 'reports', subject, issuer: 'test', audience: 'payments', expiresIn: 60 });
  return { switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer ' + value } }) }) } as never;
}
describe('Reports confirmed movement source', () => {
  it('requires both dedicated scope and subject', () => {
    const guard = new ReportsMovementsGuard(config);
    expect(guard.canActivate(context())).toBe(true);
    expect(() => guard.canActivate(context('bookings-service'))).toThrow();
    expect(() => guard.canActivate(context('reports-service', 'payments:charge'))).toThrow();
  });
  it('retains approved charge after partial refund and dates the refund independently', async () => {
    const query = new ReportsPaymentFactsQuery({ payment: { findMany: jest.fn().mockResolvedValue([{ id: 'p', bookingId: 'b', approvedAt: new Date('2026-11-02'), amountMinor: 10000n, currency: 'COP', refunds: [{ id: 'r', amountMinor: 2000n, currency: 'COP', statusHistory: [{ occurredAt: new Date('2026-11-05') }] }] }]) } } as unknown as PrismaService);
    const full = await query.execute(['b'], new Date('2026-11-01'), new Date('2026-11-11'));
    expect(full).toEqual({ items: [{ id: 'charge:p', bookingId: 'b', kind: 'CHARGE', amountMinor: '10000', currency: 'COP', occurredAt: '2026-11-02T00:00:00.000Z' }, { id: 'refund:r', bookingId: 'b', kind: 'REFUND', amountMinor: '2000', currency: 'COP', occurredAt: '2026-11-05T00:00:00.000Z' }] });
    const later = await query.execute(['b'], new Date('2026-11-04'), new Date('2026-11-11'));
    expect(later).toMatchObject({ items: [{ kind: 'REFUND', amountMinor: '2000' }] });
    expect(JSON.stringify(later)).not.toMatch(/payer|token|fingerprint/);
  });
});
