import { PrismaClient } from '../../src/infrastructure/persistence/generated/client';
import { PostgreSqlSearchIndexAdapter } from '../../src/infrastructure/search/postgresql-search-index.adapter';
import { createSearchQuery } from '../../src/domain/search-query';
import { describeWithPostgres, searchTestDatabaseUrl } from '../helpers/dependencies';
import type { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';

describeWithPostgres('PostgreSqlSearchIndexAdapter', () => {
  const prisma = new PrismaClient({ datasourceUrl: searchTestDatabaseUrl! });
  const adapter = new PostgreSqlSearchIndexAdapter(prisma as unknown as PrismaService);
  beforeAll(async () => { await prisma.$connect(); await prisma.$executeRawUnsafe('TRUNCATE availability_windows, search_documents CASCADE'); await prisma.$executeRawUnsafe(`INSERT INTO search_documents ("accommodationId","projectionVersion","published","name","description","countryCode","region","city","minNightlyPrice","currency","capacity","amenities","keywords","sourceUpdatedAt") VALUES ('00000000-0000-4000-8000-000000000001',1,true,'Casa Bogotá','hotel con piscina','CO','Cundinamarca','Bogotá',250000,'COP',4,ARRAY['wifi','piscina'],ARRAY['hotel'],NOW()), ('00000000-0000-4000-8000-000000000002',1,false,'Oculta','hotel','CO',NULL,'Bogotá',100000,'COP',8,ARRAY['wifi','piscina'],ARRAY['hotel'],NOW())`); await prisma.$executeRawUnsafe(`INSERT INTO availability_windows ("id","accommodationId","startDate","endDate","availableCapacity","projectionVersion") VALUES ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','2026-12-01','2026-12-31',4,1)`); });
  afterAll(async () => prisma.$disconnect());
  it('combines publication, location, price, capacity, amenities and text with AND semantics', async () => {
    const result = await adapter.search(createSearchQuery({ q: 'hotel piscina', location: 'Bogotá', minPrice: 100000, maxPrice: 300000, currency: 'COP', guests: 4, amenities: ['wifi', 'piscina'] }));
    expect(result.items).toHaveLength(1); expect(result.items[0]?.name).toBe('Casa Bogotá');
  });
  it('matches a city with or without accents', async () => {
    const result = await adapter.search(createSearchQuery({ location: 'Bogota' }));
    expect(result.items.map(item => item.name)).toContain('Casa Bogotá');
  });
  it('keeps the filtered total when the requested page is beyond the last result', async () => {
    const result = await adapter.search(createSearchQuery({ location: 'Bogotá', page: 2, pageSize: 1 }));
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(1);
    expect(result.hasNext).toBe(false);
  });
  it('treats injection text as a parameter', async () => { await expect(adapter.search(createSearchQuery({ q: "hotel'); DROP TABLE search_documents;--" }))).resolves.toBeDefined(); expect(await prisma.searchDocument.count()).toBe(2); });
  it('requires a projected window covering the full half-open interval', async () => { const result = await adapter.search(createSearchQuery({ checkIn: '2026-12-10', checkOut: '2026-12-15', guests: 2 })); expect(result.items).toHaveLength(1); expect(result.availabilityKind).toBe('PROJECTED'); });
  it('matches dates, guests, currency and price on one room before paginating', async () => {
    const cheap = { roomId: '30000000-0000-4000-8000-000000000001', capacity: 1, price: 10, currency: 'USD' };
    const large = { roomId: '30000000-0000-4000-8000-000000000002', capacity: 4, price: 90, currency: 'USD' };
    const where = { accommodationId: '00000000-0000-4000-8000-000000000001' };
    await prisma.searchDocument.update({ where, data: { rooms: [cheap, large] } });
    const available = jest.fn((ids: string[]) => Promise.resolve(ids.filter(id => id === large.roomId)));
    const live = new PostgreSqlSearchIndexAdapter(prisma as unknown as PrismaService, { available });
    const stay = { guests: 3, checkIn: '2026-12-10', checkOut: '2026-12-15', currency: 'USD', countryCode: 'co' };
    try {
      expect((await live.search(createSearchQuery({ ...stay, maxPrice: 20 }))).total).toBe(0);
      expect((await live.search(createSearchQuery({ ...stay, countryCode: 'MX' }))).total).toBe(0);
      const page = await live.search(createSearchQuery(stay));
      expect(page.items).toMatchObject([{ minNightlyPrice: 90, capacity: 4, currency: 'USD' }]);
      expect(available).toHaveBeenCalledWith([large.roomId], stay.checkIn, stay.checkOut);
      expect(await live.search(createSearchQuery({ ...stay, page: 2, pageSize: 1 }))).toMatchObject({ total: 1, items: [] });
      available.mockResolvedValue([]);
      expect((await live.search(createSearchQuery(stay))).total).toBe(0);
    } finally {
      await prisma.$executeRaw`UPDATE search_documents SET rooms = NULL WHERE "accommodationId" = ${where.accommodationId}::uuid`;
    }
  });
});
