import { SnapshotStore } from '../src/infrastructure/store';
import { PrismaClient } from '../src/infrastructure/persistence/generated/client';
import { GetReport } from '../src/application/get-report';
import { parseRange } from '../src/domain/metrics';
import { owner, other } from './support';
jest.mock('../src/infrastructure/persistence/generated/client', () => ({ PrismaClient: jest.fn() }));
describe('Reports snapshot isolation and lifecycle', () => {
  const upsert = jest.fn(async () => undefined);
  const findFirst = jest.fn(async () => null);
  const disconnect = jest.fn(async () => undefined);
  let store: SnapshotStore;
  beforeEach(() => { jest.clearAllMocks(); jest.mocked(PrismaClient).mockImplementation(() => ({ reportSnapshot: { upsert, findFirst }, $disconnect: disconnect }) as unknown as PrismaClient); store = new SnapshotStore('postgresql://example/reports_db'); });
  test('uses stable distinct cache identities per owner and keeps exact payload', async () => {
    const report = new GetReport({ source: 'LIVE', load: async () => ({ bookings: [], movements: [], supply: [] }) }, store);
    const query = { ownerId: owner, range: parseRange('2026-11-01', '2026-11-11'), group: 'day' as const };
    await report.execute(query); await report.execute(query); await report.execute({ ...query, ownerId: other });
    const calls = upsert.mock.calls as unknown as Array<[{ where: { key: string }; create: { ownerId: string; payload: { ownerId: string } } }]>;
    expect(calls[0]![0].where.key).toBe(calls[1]![0].where.key); expect(calls[0]![0].where.key).not.toBe(calls[2]![0].where.key); expect(calls[2]![0].create.payload.ownerId).toBe(other);
  });
  test('readiness checks the migrated table, fails closed and disconnects', async () => {
    expect(await store.ready()).toBe(true);
    findFirst.mockRejectedValueOnce(new Error('unavailable')); expect(await store.ready()).toBe(false);
    await store.onModuleDestroy(); expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
