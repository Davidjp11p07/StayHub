import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { AccommodationsClient } from '@gateway/infrastructure/http/accommodations.client';
import { multipart } from '@gateway/modules/accommodations/accommodations.controller';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

interface Captured {
  readonly method: string;
  readonly url: string;
  readonly authorization: string | undefined;
  readonly traceId: string;
  readonly contentType: string;
  readonly body: Buffer;
}

describe('Gateway -> Accommodations communication', () => {
  let server: Server;
  let baseUrl: string;
  let nextStatus = 200;
  const captured: Captured[] = [];

  beforeAll(async () => {
    server = createServer((request: IncomingMessage, response: ServerResponse) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        captured.push({
          method: request.method ?? '',
          url: request.url ?? '',
          authorization: request.headers.authorization,
          traceId: String(request.headers['x-trace-id'] ?? ''),
          contentType: String(request.headers['content-type'] ?? ''),
          body: Buffer.concat(chunks),
        });
        response.writeHead(nextStatus, { 'content-type': nextStatus >= 400 ? 'application/problem+json' : 'application/json' });
        response.end(JSON.stringify(nextStatus >= 400 ? { code: 'VERSION_CONFLICT' } : { id: 'p1', status: 'DRAFT' }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('stub not listening');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => new Promise<void>((resolve) => server.close(() => resolve())));
  beforeEach(() => { captured.length = 0; nextStatus = 200; });

  const client = (): AccommodationsClient =>
    new AccommodationsClient(createTestGatewayConfig({ GATEWAY_ACCOMMODATIONS_BASE_URL: baseUrl }).config, { sleep: () => Promise.resolve() });

  it('forwards the validated user bearer, trace id and JSON body', async () => {
    const body = { bytes: new TextEncoder().encode('{"name":"Casa"}'), contentType: 'application/json' };
    await expect(client().request('POST', '/properties', { traceId: 'trace-acc-1', bearer: 'user-token' }, body)).resolves.toEqual({ id: 'p1', status: 'DRAFT' });
    expect(captured[0]).toMatchObject({ method: 'POST', url: '/properties', authorization: 'Bearer user-token', traceId: 'trace-acc-1', contentType: 'application/json' });
    expect(captured[0]?.body.toString('utf8')).toBe('{"name":"Casa"}');
  });

  it('sends no Authorization header for anonymous reads', async () => {
    await client().request('GET', '/properties/abc', { traceId: 'trace-acc-2', bearer: undefined });
    expect(captured[0]?.authorization).toBeUndefined();
  });

  it('preserves Accommodations Problem Details status', async () => {
    nextStatus = 409;
    await expect(client().request('PUT', '/properties/abc', { traceId: 'trace-acc-3', bearer: 'user-token' })).rejects.toMatchObject({ status: 409 });
  });

  it('rebuilds the photo multipart with a single "file" part and the original bytes', () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);
    const body = multipart({ buffer: bytes, mimetype: 'image/jpeg' });
    const boundary = /boundary=(\S+)$/u.exec(body.contentType)?.[1] ?? '';
    const raw = Buffer.from(body.bytes);
    expect(raw.toString('latin1')).toContain(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo"\r\nContent-Type: image/jpeg\r\n\r\n`);
    expect(raw.includes(bytes)).toBe(true);
    expect(raw.toString('latin1').endsWith(`\r\n--${boundary}--\r\n`)).toBe(true);
  });
});
