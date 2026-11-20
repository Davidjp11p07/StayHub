import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { INVENTORY_CONFIG } from '@inventory/infrastructure/config/config.module';
import { AccommodationsRoomContextClient } from '@inventory/infrastructure/http/accommodations-room-context.client';
import { InventoryLogger, redact } from '@inventory/infrastructure/observability/inventory-logger';
import { InventoryMetrics } from '@inventory/infrastructure/observability/inventory-metrics';
import { PrismaService } from '@inventory/infrastructure/persistence/prisma/prisma.service';
import { OutboundServiceTokenProvider } from '@inventory/infrastructure/security/outbound-service-token.provider';
import { configureHttp } from '@inventory/interfaces/http/configure-http';
import { HealthController } from '@inventory/modules/health/health.controller';

import { startAccommodationsStub, type AccommodationsStub } from '../fixtures/accommodations-context.fixture';
import { testConfig } from '../fixtures/jwt.fixture';

const url = process.env.INVENTORY_TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;
const UNREACHABLE = 'postgresql://inventory:x@127.0.0.1:1/inventory_db?connect_timeout=1';

async function appWith(databaseUrl: string, accommodationsUrl: string): Promise<{ app: INestApplication; client: AccommodationsRoomContextClient }> {
  const config = testConfig({ databaseUrl, accommodationsUrl, accommodationsCircuitFailureThreshold: 1 });
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      { provide: INVENTORY_CONFIG, useValue: config },
      { provide: PrismaService, useFactory: () => new PrismaService(config) },
      OutboundServiceTokenProvider,
      AccommodationsRoomContextClient,
      InventoryMetrics,
    ],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureHttp(app);
  await app.init();
  return { app, client: app.get(AccommodationsRoomContextClient) };
}

describe('health with PostgreSQL unavailable', () => {
  let app: INestApplication;
  beforeAll(async () => { ({ app } = await appWith(UNREACHABLE, 'http://127.0.0.1:1')); });
  afterAll(async () => { await app?.close(); });

  it('keeps liveness up', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200, { status: 'ok' });
  });

  it('reports not_ready with 503 and no connection details', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready').expect(503);
    expect(response.body).toEqual({ status: 'not_ready', database: 'down', accommodations: 'unknown' });
    expect(JSON.stringify(response.body)).not.toMatch(/127\.0\.0\.1|postgres/iu);
  });
});

describeDb('health with PostgreSQL 16 available', () => {
  let app: INestApplication;
  let client: AccommodationsRoomContextClient;
  let stub: AccommodationsStub;

  beforeAll(async () => {
    stub = await startAccommodationsStub();
    ({ app, client } = await appWith(url ?? '', stub.url));
  });
  afterAll(async () => { await app?.close(); await stub.close(); });

  it('is ready before Accommodations has been called (unknown is not a failure)', async () => {
    await request(app.getHttpServer()).get('/health/ready').expect(200, { status: 'ready', database: 'up', accommodations: 'unknown' });
  });

  it('degrades (200) when Accommodations is failing, so the database-backed process stays in rotation', async () => {
    stub.setGlobal({ kind: 'status', status: 503 });
    await client.getContext(randomUUID(), 'trace-health-01').catch(() => undefined);
    await request(app.getHttpServer()).get('/health/ready').expect(200, { status: 'degraded', database: 'up', accommodations: 'down' });
  });

  it('returns to ready once Accommodations answers again', async () => {
    stub.setGlobal(null);
    const room = stub.addRoom(randomUUID());
    const recovered = new AccommodationsRoomContextClient(testConfig({ accommodationsUrl: stub.url }), new OutboundServiceTokenProvider(testConfig()));
    await recovered.getContext(room.roomId, 'trace-health-02');
    expect(recovered.health()).toBe('up');
  });
});

describe('redacted structured logs', () => {
  let output: string[];
  let spy: jest.SpyInstance;
  beforeEach(() => {
    output = [];
    spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => { output.push(String(chunk)); return true; });
  });
  afterEach(() => { spy.mockRestore(); });

  it('writes JSON lines and honours the minimum level', () => {
    const logger = new InventoryLogger(testConfig({ logLevel: 'warn' }));
    logger.log('hidden');
    logger.debug('hidden');
    logger.warn({ event: 'accommodations.degraded' }, 'Health');
    logger.error('failed', 'stack with secrets');
    expect(output).toHaveLength(2);
    expect(JSON.parse(output[0] ?? '{}')).toMatchObject({ level: 'warn', service: 'room-inventory-service', context: 'Health', message: { event: 'accommodations.degraded' } });
    expect(output.join('')).not.toContain('stack with secrets');
  });

  it('never logs tokens, private keys, credentials, bodies or item names', () => {
    const value = redact({
      authorization: 'Bearer abc.def.ghi',
      note: 'Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlLXZhbHVl',
      pem: '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----',
      url: 'postgresql://inventory:super-secret@inventory-db:5432/inventory_db',
      body: { items: [{ name: 'Champagne' }] },
      name: 'Minibar secreto',
      route: 'InventoryController.get',
      durationMs: 12,
    });
    const text = JSON.stringify(value);
    expect(text).not.toMatch(/super-secret|eyJhbGci|abc\.def\.ghi|MIIE|Champagne|Minibar/u);
    expect(value).toMatchObject({ route: 'InventoryController.get', durationMs: 12, name: '[REDACTED]', body: '[REDACTED]' });
  });
});
