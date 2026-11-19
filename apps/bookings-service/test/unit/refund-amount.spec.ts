import { Prisma } from '@bookings/infrastructure/persistence/generated/client';
import { calculateRefundAmount } from '@bookings/infrastructure/persistence/prisma/cancel-booking.unit-of-work';

describe('cancellation refund amount', () => {
  it.each([
    ['20.00', 50, '10.00'],
    ['10.05', 50, '5.03'],
    ['10.05', 100, '10.05'],
    ['10.05', 0, '0.00'],
  ])('applies %s at %s%% and rounds to currency precision', (total, percent, expected) => {
    expect(calculateRefundAmount(new Prisma.Decimal(total), percent).toFixed(2)).toBe(expected);
  });
});
