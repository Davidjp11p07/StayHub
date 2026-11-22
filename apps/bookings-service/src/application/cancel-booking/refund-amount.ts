import { Prisma } from '../../infrastructure/persistence/generated/client';

export function calculateRefundAmount(total: Prisma.Decimal, percent: number): Prisma.Decimal {
  return new Prisma.Decimal(total).mul(percent).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
