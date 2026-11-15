import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PrismaClient } from '@inventory/infrastructure/persistence/generated/client';

const url = process.env.INVENTORY_TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;
const sql = readFileSync(resolve(__dirname, '../../prisma/migrations/001_room_inventory/migration.sql'), 'utf8');
/** SQL statements only: comments may legitimately name other services. */
const statements = sql.replace(/--.*$/gmu, '');

describe('initial Inventory migration (static)', () => {
  it.each(['CREATE TABLE "room_inventories"', 'CREATE TABLE "inventory_items"', "CREATE TYPE \"inventory_item_type\" AS ENUM ('PRODUCT', 'SERVICE')"])('contains %s', (fragment) => {
    expect(sql).toContain(fragment);
  });

  it('only references local tables (no FK to Accommodations or any other service)', () => {
    const references = [...statements.matchAll(/REFERENCES\s+"([a-z_]+)"/gu)].map((match) => match[1]);
    expect(references).toEqual(['room_inventories']);
    expect(statements).not.toMatch(/accommodations|properties|rooms"|bookings/iu);
  });
});

/** Applied by `npm run prisma:inventory:migrate:deploy` against a disposable PostgreSQL 16. */
describeDb('initial Inventory migration on PostgreSQL 16', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: url ?? '' } } });
  const roomId = randomUUID();
  const base = { roomId, propertyId: randomUUID(), ownerId: randomUUID() };

  afterAll(async () => {
    await prisma.roomInventory.deleteMany({ where: { roomId } });
    await prisma.$disconnect();
  });

  it('runs on PostgreSQL 16', async () => {
    const rows = await prisma.$queryRaw<Array<{ version: string }>>`SELECT current_setting('server_version') AS version`;
    expect(rows[0]?.version).toMatch(/^16\./u);
  });

  it('creates the expected indexes', async () => {
    const rows = await prisma.$queryRaw<Array<{ indexname: string }>>`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`;
    expect(rows.map((row) => row.indexname)).toEqual(expect.arrayContaining([
      'room_inventories_pkey', 'room_inventories_owner_updated_idx', 'inventory_items_pkey', 'inventory_items_room_active_idx', 'inventory_items_room_type_idx',
    ]));
  });

  it('declares only the local foreign key', async () => {
    const rows = await prisma.$queryRaw<Array<{ conname: string; target: string }>>`
      SELECT conname, confrelid::regclass::text AS target FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace`;
    expect(rows).toEqual([{ conname: 'inventory_items_room_id_fkey', target: 'room_inventories' }]);
  });

  it('rejects a persisted aggregate with version 0', async () => {
    await expect(prisma.roomInventory.create({ data: { ...base, version: 0 } })).rejects.toThrow();
  });

  it('enforces quantity 0..1 000 000 and trimmed non-empty names', async () => {
    await prisma.roomInventory.create({ data: { ...base, version: 1 } });
    const item = { roomId, type: 'PRODUCT' as const, active: true };
    await expect(prisma.inventoryItem.create({ data: { ...item, id: randomUUID(), name: 'Agua', quantityAvailable: 1_000_001 } })).rejects.toThrow();
    await expect(prisma.inventoryItem.create({ data: { ...item, id: randomUUID(), name: 'Agua', quantityAvailable: -1 } })).rejects.toThrow();
    await expect(prisma.inventoryItem.create({ data: { ...item, id: randomUUID(), name: '  Agua ', quantityAvailable: 1 } })).rejects.toThrow();
    await expect(prisma.inventoryItem.create({ data: { ...item, id: randomUUID(), name: '', quantityAvailable: 1 } })).rejects.toThrow();
    await expect(prisma.inventoryItem.create({ data: { ...item, id: randomUUID(), name: 'Agua', quantityAvailable: 0 } })).resolves.toMatchObject({ quantityAvailable: 0, active: true });
  });

  it('rejects an item whose aggregate does not exist', async () => {
    await expect(prisma.inventoryItem.create({ data: { id: randomUUID(), roomId: randomUUID(), type: 'SERVICE', name: 'Spa', quantityAvailable: 1 } })).rejects.toThrow();
  });
});
