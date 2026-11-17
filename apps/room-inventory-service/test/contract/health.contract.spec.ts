import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AccommodationsRoomContextClient, type DependencyHealth } from '@inventory/infrastructure/http/accommodations-room-context.client';
import { PrismaService } from '@inventory/infrastructure/persistence/prisma/prisma.service';
import { configureHttp } from '@inventory/interfaces/http/configure-http';
import { HealthController } from '@inventory/modules/health/health.controller';

interface HealthState {
  database: boolean;
  accommodations: DependencyHealth;
}

async function healthApp(state: HealthState): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      { provide: PrismaService, useValue: { isReady: async (): Promise<boolean> => state.database } },
      { provide: AccommodationsRoomContextClient, useValue: { health: (): DependencyHealth => state.accommodations } },
    ],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureHttp(app);
  await app.init();
  return app;
}

/** T061: the probes expose a closed, stable contract; no URLs, credentials or driver details ever leak. */
describe('health contract', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('GET /health/live reports only process liveness, even when dependencies are down', async () => {
    app = await healthApp({ database: false, accommodations: 'down' });
    const response = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toMatch(/^[A-Za-z0-9._:-]{8,128}$/u);
  });

  const cases: Array<[HealthState, number, Record<string, string>]> = [
    [{ database: true, accommodations: 'unknown' }, 200, { status: 'ready', database: 'up', accommodations: 'unknown' }],
    [{ database: true, accommodations: 'up' }, 200, { status: 'ready', database: 'up', accommodations: 'up' }],
    [{ database: true, accommodations: 'down' }, 200, { status: 'degraded', database: 'up', accommodations: 'down' }],
    [{ database: false, accommodations: 'up' }, 503, { status: 'not_ready', database: 'down', accommodations: 'up' }],
    [{ database: false, accommodations: 'unknown' }, 503, { status: 'not_ready', database: 'down', accommodations: 'unknown' }],
  ];
  it.each(cases)('GET /health/ready with %#', async (state, status, body) => {
    app = await healthApp(state);
    const response = await request(app.getHttpServer()).get('/health/ready').expect(status);
    expect(response.body).toEqual(body);
    expect(Object.keys(response.body).sort()).toEqual(['accommodations', 'database', 'status']);
  });

  it('readiness never exposes connection strings or upstream error text', async () => {
    app = await healthApp({ database: false, accommodations: 'down' });
    const response = await request(app.getHttpServer()).get('/health/ready').expect(503);
    expect(JSON.stringify(response.body)).not.toMatch(/postgres|postgresql|127\.0\.0\.1|error|stack/iu);
  });
});
