import { randomUUID } from 'node:crypto';

import { trace } from '@opentelemetry/api';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import request from 'supertest';

import { InventoryLogger } from '@inventory/infrastructure/observability/inventory-logger';
import { InventoryMetrics } from '@inventory/infrastructure/observability/inventory-metrics';
import { PrismaInventoryRepository } from '@inventory/infrastructure/persistence/prisma/prisma-inventory.repository';
import type { PrismaService } from '@inventory/infrastructure/persistence/prisma/prisma.service';

import { createInventoryTestApp, type InventoryTestApp } from '../fixtures/inventory-app';
import { delegatedToken, testConfig } from '../fixtures/jwt.fixture';

/** T062: metrics, traces and logs for GET/POST/PUT, 409 and the remote dependency, with no PII. */
describe('observability for inventory requests', () => {
  let ctx: InventoryTestApp;
  let metrics: InventoryMetrics;
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;
  let output: string[];
  let stdout: jest.SpyInstance;
  const ownerId = randomUUID();

  beforeAll(async () => {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    trace.setGlobalTracerProvider(provider);
    metrics = new InventoryMetrics();
    jest.spyOn(metrics, 'httpDuration');
    jest.spyOn(metrics, 'dbDuration');
    jest.spyOn(metrics, 'accommodationsCall');
    jest.spyOn(metrics, 'conflict');
    jest.spyOn(metrics, 'itemCount');
    ctx = await createInventoryTestApp({ metrics, logger: new InventoryLogger(testConfig({ logLevel: 'info' })) });
  });

  afterAll(async () => {
    await ctx?.close();
    await provider?.shutdown();
    trace.disable();
  });

  beforeEach(() => {
    output = [];
    stdout = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      output.push(String(chunk));
      return true;
    });
    exporter.reset();
    for (const method of ['httpDuration', 'dbDuration', 'accommodationsCall', 'conflict', 'itemCount'] as const) {
      (metrics[method] as jest.Mock).mockClear();
    }
    ctx.stub.setGlobal(null);
  });

  afterEach(() => stdout.mockRestore());

  const authorization = async (role: 'OWNER' | 'ADMIN' | 'GUEST' = 'OWNER', sub = ownerId): Promise<string> =>
    `Bearer ${await delegatedToken({ sub, role })}`;

  it('GET records HTTP duration, remote latency and a trace with route/role/roomId', async () => {
    const room = ctx.stub.addRoom(ownerId);
    const response = await request(ctx.app.getHttpServer())
      .get(`/inventory/rooms/${room.roomId}`)
      .set('authorization', await authorization())
      .set('x-request-id', 'trace-obs-00001')
      .expect(200);

    expect(metrics.httpDuration).toHaveBeenCalledWith(expect.any(Number), { route: 'InventoryController.get', status: 200 });
    expect(metrics.accommodationsCall).toHaveBeenCalledWith(expect.any(Number), 'ok');
    expect(JSON.stringify((metrics.httpDuration as jest.Mock).mock.calls)).not.toContain(room.roomId);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.attributes).toMatchObject({
      'http.route': 'InventoryController.get',
      'http.method': 'GET',
      'http.status_code': 200,
      'stayhub.role': 'OWNER',
      'stayhub.room_id': room.roomId,
    });

    const line = JSON.parse(output.find((entry) => entry.includes('http.request')) ?? '{}') as Record<string, unknown>;
    expect(line).toMatchObject({ level: 'info', message: { event: 'http.request', route: 'InventoryController.get', status: 200, role: 'OWNER', roomId: room.roomId }, traceId: 'trace-obs-00001' });
    expect(response.body).not.toHaveProperty('ownerId');
  });

  it('POST logs only metadata: never item names, tokens or request bodies', async () => {
    const room = ctx.stub.addRoom(ownerId);
    const token = await authorization();
    await request(ctx.app.getHttpServer())
      .post(`/inventory/rooms/${room.roomId}/items`)
      .set('authorization', token)
      .set('x-request-id', 'trace-obs-00002')
      .send({ type: 'PRODUCT', name: 'Champagne privado', quantityAvailable: 2, active: true })
      .expect(201);

    expect(metrics.httpDuration).toHaveBeenCalledWith(expect.any(Number), { route: 'InventoryController.add', status: 201 });
    const text = output.join('');
    expect(text).toContain('http.request');
    expect(text).not.toContain('Champagne privado');
    expect(text).not.toContain(token.replace('Bearer ', ''));
  });

  it('PUT 409 increments the conflict counter without leaking names', async () => {
    const room = ctx.stub.addRoom(ownerId);
    const items = ctx.repository.seedPair(room.roomId, room.propertyId, ownerId);
    await request(ctx.app.getHttpServer())
      .put(`/inventory/rooms/${room.roomId}`)
      .set('authorization', await authorization())
      .set('x-request-id', 'trace-obs-00003')
      .send({ expectedVersion: 9, items: [{ id: items.first, type: 'PRODUCT', name: 'Agua premium', quantityAvailable: 3, active: true }] })
      .expect(409);

    expect(metrics.conflict).toHaveBeenCalledWith('replace');
    expect(output.join('')).not.toContain('Agua premium');
  });

  it('records the Accommodations outage as unavailable and still redacts request data', async () => {
    const room = ctx.stub.addRoom(ownerId);
    ctx.stub.setGlobal({ kind: 'status', status: 503 });
    await request(ctx.app.getHttpServer())
      .get(`/inventory/rooms/${room.roomId}`)
      .set('authorization', await authorization())
      .set('x-request-id', 'trace-obs-00004')
      .expect(503);

    expect(metrics.accommodationsCall).toHaveBeenCalledWith(expect.any(Number), 'unavailable');
    expect(output.join('')).not.toContain('X-Item-Name');
  });

  it('the Prisma adapter records database duration and item count without item names', async () => {
    const now = new Date();
    const row = {
      roomId: randomUUID(), propertyId: randomUUID(), ownerId, version: 1, createdAt: now, updatedAt: now,
      items: [{ id: randomUUID(), roomId: randomUUID(), type: 'PRODUCT', name: 'Minibar secreto', quantityAvailable: 1, active: true, createdAt: now, updatedAt: now }],
    };
    const prisma = {
      roomInventory: { findUnique: jest.fn(async () => row) },
    } as unknown as PrismaService;

    const aggregate = await new PrismaInventoryRepository(prisma, metrics).findByRoomId(row.roomId);
    expect(aggregate?.items).toHaveLength(1);
    expect(metrics.dbDuration).toHaveBeenCalledWith(expect.any(Number), { operation: 'find_by_room' });
    expect(metrics.itemCount).toHaveBeenCalledWith(1, { operation: 'get' });
    expect(JSON.stringify((metrics.itemCount as jest.Mock).mock.calls)).not.toContain('Minibar secreto');
  });
});
