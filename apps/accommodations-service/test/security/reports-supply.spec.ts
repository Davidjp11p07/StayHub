import { ReportsSupplyGuard, ReportSupplyController } from '../../src/interfaces/http/internal/report-supply.controller';
import { ReportsSupplyQuery } from '../../src/infrastructure/persistence/prisma/reports-supply.query';
import { serviceToken, testConfig } from '../fixtures/config.fixture';
import type { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
function context(sub = 'reports-service', scope = 'reports:read'): Parameters<ReportsSupplyGuard['canActivate']>[0] {
  return { switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer ' + serviceToken(sub, scope) } }) }) } as never;
}
describe('Reports supply source', () => {
  it('accepts reports scope only for the reports service', () => {
    const guard = new ReportsSupplyGuard(testConfig());
    expect(guard.canActivate(context())).toBe(true);
    expect(() => guard.canActivate(context('bookings-service'))).toThrow();
    expect(() => guard.canActivate(context('reports-service', 'accommodations:booking-quote'))).toThrow();
  });
  it('returns immutable historical room IDs and no private property fields', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ id: 1n, propertyId: 'property', name: 'Casa', capturedAt: new Date('2026-11-01'), roomIds: ['room'] }]);
    const query = new ReportsSupplyQuery({ $queryRaw: queryRaw } as unknown as PrismaService);
    const result = await query.execute('11111111-1111-4111-8111-111111111111', undefined, 200);
    expect(result).toEqual({ items: [{ id: '1', propertyId: 'property', name: 'Casa', capturedAt: '2026-11-01T00:00:00.000Z', roomIds: ['room'] }], nextCursor: null });
    const controller = new ReportSupplyController(query);
    await expect(controller.list({ ownerId: 'not-a-uuid' })).rejects.toThrow();
    await expect(controller.list({ ownerId: '11111111-1111-4111-8111-111111111111', after: '-1' })).rejects.toThrow();
  });
});
