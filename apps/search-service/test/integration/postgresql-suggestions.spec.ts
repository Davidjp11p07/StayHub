import { PrismaClient } from '../../src/infrastructure/persistence/generated/client';
import { PostgreSqlSearchIndexAdapter } from '../../src/infrastructure/search/postgresql-search-index.adapter';
import { createSearchQuery } from '../../src/domain/search-query';
import { createSuggestionQuery } from '../../src/domain/suggestion';
import {
  describeWithPostgres,
  searchTestDatabaseUrl,
} from '../helpers/dependencies';
import type { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';

describeWithPostgres('PostgreSQL suggestions', () => {
  const prisma = new PrismaClient({ datasourceUrl: searchTestDatabaseUrl! });
  const adapter = new PostgreSqlSearchIndexAdapter(
    prisma as unknown as PrismaService,
  );

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$executeRawUnsafe(
      'TRUNCATE availability_windows, search_documents CASCADE',
    );
    await prisma.$executeRawUnsafe(`
      INSERT INTO search_documents
        ("accommodationId","projectionVersion","published","name","description","countryCode","region","city","addressSummary","minNightlyPrice","currency","capacity","amenities","keywords","sourceUpdatedAt")
      VALUES
        ('10000000-0000-4000-8000-000000000001',1,true,'Casa Bogotá','visible','CO','Cundinamarca','Bogotá','dato privado',100000,'COP',2,ARRAY[]::text[],ARRAY[]::text[],NOW()),
        ('10000000-0000-4000-8000-000000000002',1,true,'Casa del Sol','visible','CO','Cundinamarca','Bogotá','otra dirección',120000,'COP',4,ARRAY[]::text[],ARRAY[]::text[],NOW()),
        ('10000000-0000-4000-8000-000000000003',1,false,'Bogotá Secreta','oculta','CO','Cundinamarca','Bogotá Oculta','no exponer',90000,'COP',2,ARRAY[]::text[],ARRAY[]::text[],NOW())
    `);
  });

  afterAll(async () => prisma.$disconnect());

  it('uses pg_trgm over published names and cities and deduplicates locations', async () => {
    const rows = await adapter.suggest(
      createSuggestionQuery({ q: 'bogta', limit: 20 }),
      0.2,
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'Bogotá', type: 'LOCATION' }),
        expect.objectContaining({ text: 'Casa Bogotá', type: 'PROPERTY' }),
      ]),
    );
    expect(rows.filter((row) => row.text === 'Bogotá')).toHaveLength(1);
    expect(rows.some((row) => row.text.includes('Oculta'))).toBe(false);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['score', 'text', 'type']);
      expect(row).not.toHaveProperty('addressSummary');
      expect(row).not.toHaveProperty('accommodationId');
    }
  });

  it('groups accent variants locally and distinguishes homonyms across regions and countries', async () => {
    await prisma.$executeRawUnsafe(`
      INSERT INTO search_documents ("accommodationId","projectionVersion","published","name","description","countryCode","region","city","minNightlyPrice","currency","capacity","sourceUpdatedAt")
      SELECT gen_random_uuid(),1,true,'Prueba','visible',country,region,city,100,'COP',2,NOW()
      FROM (VALUES ('CO','Norte','San José'),('CO','norte','San Jose'),('CO','Sur','San José'),('CR','Norte','San José')) v(country,region,city)
    `);
    const locations = (await adapter.suggest(createSuggestionQuery({ q: 'san jose' }), 0.95))
      .filter(row => row.type === 'LOCATION');
    expect(locations).toHaveLength(3);
    const totals = [];
    for (const location of locations) {
      totals.push((await adapter.search(createSearchQuery({ q: location.text }))).total);
    }
    expect(totals.sort()).toEqual([1, 1, 2]);
  });

  it('applies the configurable threshold and selects no personal fields', async () => {
    const rows = await adapter.suggest(
      createSuggestionQuery({ q: 'bogta', limit: 20 }),
      0.95,
    );
    expect(rows).toEqual([]);
  });
});
