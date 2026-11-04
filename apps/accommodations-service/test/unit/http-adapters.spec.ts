import { Body, Controller, Post } from '@nestjs/common';
import { IsString } from 'class-validator';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { configureHttp } from '../../src/interfaces/http/configure-http';

class ProbeInput {
  @IsString()
  name!: string;
}

@Controller('probe')
class ProbeController {
  @Post()
  create(@Body() input: ProbeInput): ProbeInput { return input; }
}

describe('HTTP adapters', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [ProbeController] }).compile();
    app = module.createNestApplication({ logger: false });
    configureHttp(app);
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => { await app.close(); });

  it('returns RFC Problem Details and rejects unknown properties in JSON bodies', async () => {
    const response = await request(server).post('/probe').send({ name: 'Hotel', unexpected: true }).expect(400).expect('content-type', /application\/problem\+json/);
    const problem = (response as unknown as { body: unknown }).body;
    expect(problem).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(Array.isArray((problem as { errors?: unknown }).errors)).toBe(true);
    expect(response.headers['x-trace-id']).toMatch(/^[0-9a-f]{32}$/);
  });

  it('accepts valid DTOs and strips no declared properties', async () => {
    const response = await request(server).post('/probe').send({ name: 'Hotel' }).expect(201);
    expect(response.body).toEqual({ name: 'Hotel' });
  });
});
