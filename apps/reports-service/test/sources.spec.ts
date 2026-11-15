import { LiveSources } from '../src/infrastructure/sources';
import { GetReport } from '../src/application/get-report';
import { parseRange } from '../src/domain/metrics';
import { config, owner } from './support';
const q = { ownerId: owner, range: parseRange('2026-11-01', '2026-11-11'), group: 'day' as const };
const booking = { id: owner, ownerId: owner, propertyId: owner, roomId: owner, status: 'CONFIRMED', createdAt: '2026-11-02T00:00:00Z', cancelledAt: null, checkIn: '2026-11-03', checkOut: '2026-11-05' };
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
describe('REST sources and application consistency', () => {
  test('loads authorized bookings, paginated supply and batches payments', async () => {
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockImplementation(async input => String(input).startsWith('http://bookings') ? json({ items: [booking], nextCursor: null }) : String(input).startsWith('http://accommodations') ? json({ items: [], nextCursor: null }) : json({ items: [] }));
    const sources = new LiveSources(config, fetcher);
    expect((await sources.load(q, '2026-10-22')).bookings).toEqual([booking]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    const call = fetcher.mock.calls.find(c => String(c[0]).startsWith('http://payments'))!;
    expect(JSON.parse(call[1]!.body as string)).toEqual({ bookingIds: [owner], from: '2026-10-22', to: '2026-11-11' });
  });
  test('source errors never become empty report', async () => { const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockResolvedValue(new Response('error', { status: 503 })); await expect(new LiveSources(config, fetcher).load(q, q.range.from)).rejects.toThrow('REPORT_SOURCE_UNAVAILABLE'); });
  test('malformed pages fail closed', async () => { const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockImplementation(async () => json({ wrong: [] })); await expect(new LiveSources(config, fetcher).load(q, q.range.from)).rejects.toThrow(); });
  test('repeated pagination cursor is rejected', async () => { const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockImplementation(async () => json({ items: [], nextCursor: 'repeat' })); await expect(new LiveSources(config, fetcher).load(q, q.range.from)).rejects.toThrow(); });
  test('payments response must contain valid items', async () => { const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockImplementation(async input => String(input).startsWith('http://bookings') ? json({ items: [booking], nextCursor: null }) : String(input).startsWith('http://accommodations') ? json({ items: [], nextCursor: null }) : json({ wrong: true })); await expect(new LiveSources(config, fetcher).load(q, q.range.from)).rejects.toThrow(); });
  test('application refuses owner contamination and never saves it', async () => { const save = jest.fn(); const useCase = new GetReport({ source: 'LIVE', load: async () => ({ bookings: [{ ...booking, ownerId: 'another' }], supply: [], movements: [] }) }, { save }); await expect(useCase.execute(q)).rejects.toThrow('SOURCE_OWNER_MISMATCH'); expect(save).not.toHaveBeenCalled(); });
  test('mode DEMO is explicit in the report', async () => { const report = await new GetReport({ source: 'DEMO', load: async () => ({ bookings: [], supply: [], movements: [] }) }, { save: async () => undefined }).execute(q); expect(report.source).toBe('DEMO'); expect(report.previous.reservations.total).toBe(0); });
});
