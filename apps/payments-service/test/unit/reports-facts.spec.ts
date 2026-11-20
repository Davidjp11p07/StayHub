import { ReportsPaymentFactsQuery } from '../../src/infrastructure/persistence/prisma/reports-facts.query';
import type { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';

describe('payment report facts', () => {
  const from = new Date('2030-03-01T00:00:00Z');
  const to = new Date('2030-03-02T00:00:00Z');
  const at = new Date('2030-03-01T10:00:00Z');
  const payment = {
    id: 'payment', bookingId: 'booking', approvedAt: null, amountMinor: 1000n, currency: 'USD',
    statusHistory: [{ occurredAt: at }], refunds: [{ id: 'refund', amountMinor: 1000n, currency: 'USD', statusHistory: [{ occurredAt: at }] }],
  };

  it.each([null, at])('counts a single charge and refund when approvedAt is %s', async approvedAt => {
    const prisma = { payment: { findMany: jest.fn().mockResolvedValue([{ ...payment, approvedAt }]) } };
    const query = new ReportsPaymentFactsQuery(prisma as unknown as PrismaService);
    const result = await query.execute(['booking'], from, to);
    expect(result).toEqual({ items: [
      { id: 'charge:payment', bookingId: 'booking', kind: 'CHARGE', amountMinor: '1000', currency: 'USD', occurredAt: at.toISOString() },
      { id: 'refund:refund', bookingId: 'booking', kind: 'REFUND', amountMinor: '1000', currency: 'USD', occurredAt: at.toISOString() },
    ] });
  });
});
