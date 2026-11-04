import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { READINESS_INDICATOR } from '../../src/modules/health/readiness-indicator';
import { configureHttp } from '../../src/interfaces/http/configure-http';

describe('health endpoints', () => {
  let app: INestApplication;
  let server: Server;
  const readiness = { isReady: jest.fn<Promise<boolean>, []>() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(READINESS_INDICATOR).useValue(readiness).compile();
    app = module.createNestApplication({ logger: false });
    configureHttp(app);
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => { await app.close(); });

  it('serves liveness without a database dependency', async () => {
    await request(server).get('/health/live').expect(200).expect({ status: 'live' });
    expect(readiness.isReady).not.toHaveBeenCalled();
  });

  it('uses the injected readiness indicator and maps not-ready to 503 Problem Details', async () => {
    readiness.isReady.mockResolvedValueOnce(false);
    const unavailable = await request(server).get('/health/ready').expect(503).expect('content-type', /application\/problem\+json/);
    expect(unavailable.body).toMatchObject({ status: 503 });
    readiness.isReady.mockResolvedValueOnce(true);
    await request(server).get('/health/ready').expect(200).expect({ status: 'ready' });
  });
});
