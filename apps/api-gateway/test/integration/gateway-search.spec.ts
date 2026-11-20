import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { importSPKI, jwtVerify } from 'jose';

import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';
import { SearchClient } from '@gateway/infrastructure/http/search.client';
import { SearchServiceTokenProvider } from '@gateway/infrastructure/service-auth/service-token.provider';
import { forwardQuery } from '@gateway/modules/search/search.controller';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

interface CapturedRequest {
  readonly url: string;
  readonly authorization: string;
  readonly traceId: string;
}

describe('Gateway -> Search communication', () => {
  let server: Server;
  let baseUrl: string;
  let nextStatus = 200;
  const captured: CapturedRequest[] = [];

  beforeAll(async () => {
    server = createServer((request: IncomingMessage, response: ServerResponse) => {
      captured.push({
        url: request.url ?? '',
        authorization: String(request.headers.authorization ?? ''),
        traceId: String(request.headers['x-trace-id'] ?? ''),
      });
      if (nextStatus !== 200) {
        response.writeHead(nextStatus, { 'content-type': 'application/problem+json' });
        response.end(JSON.stringify({ code: 'SEARCH_VALIDATION_FAILED' }));
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify((request.url ?? '').includes('/suggest')
        ? { items: [{ text: 'Cartagena', type: 'LOCATION' }] }
        : { items: [], page: 1, pageSize: 20, total: 0, hasNext: false, availabilityKind: null }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('stub not listening');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => new Promise<void>((resolve) => server.close(() => resolve())));
  beforeEach(() => { captured.length = 0; nextStatus = 200; });

  function client(): { search: SearchClient; publicKey: string } {
    const fixture = createTestGatewayConfig({ GATEWAY_SEARCH_BASE_URL: baseUrl });
    return {
      search: new SearchClient(fixture.config, new SearchServiceTokenProvider(fixture.config), { sleep: () => Promise.resolve() }),
      publicKey: fixture.servicePublicKeyPem,
    };
  }

  it('calls /internal/v1/search with a Search-specific service JWT and x-trace-id', async () => {
    const { search, publicKey } = client();
    await expect(search.search('?q=playa&amenities=wifi&amenities=pool', 'trace-search-001')).resolves.toMatchObject({ total: 0 });

    const call = captured[0];
    expect(call).toMatchObject({ url: '/internal/v1/search?q=playa&amenities=wifi&amenities=pool', traceId: 'trace-search-001' });
    const key = await importSPKI(publicKey, 'RS256');
    const verified = await jwtVerify(call?.authorization.replace(/^Bearer /u, '') ?? '', key, {
      issuer: 'stayhub-api-gateway',
      audience: 'stayhub-search-service',
    });
    expect(verified.payload.scope).toBe('search:invoke');
  });

  it('calls /internal/v1/search/suggest', async () => {
    const { search } = client();
    await expect(search.suggest('?q=car&limit=5', 'trace-search-002')).resolves.toEqual({ items: [{ text: 'Cartagena', type: 'LOCATION' }] });
    expect(captured[0]?.url).toBe('/internal/v1/search/suggest?q=car&limit=5');
  });

  it('preserves a Search 400 as a gateway HTTP error', async () => {
    nextStatus = 400;
    await expect(client().search.search('?minPrice=10', 'trace-search-003')).rejects.toMatchObject({ status: 400 });
  });

  it('turns Search 401/403 into dependency unavailable instead of blaming the anonymous caller', async () => {
    nextStatus = 401;
    await expect(client().search.search('', 'trace-search-004')).rejects.toBeInstanceOf(GatewayDependencyError);
  });
});

describe('Search query allowlist', () => {
  const asRequest = (query: Record<string, unknown>): Request => ({ query } as unknown as Request);

  it('forwards known scalars and repeated amenities', () => {
    expect(forwardQuery(asRequest({ q: 'playa', amenities: ['wifi', 'pool'], page: '2' }), ['q', 'page'], ['amenities']))
      .toBe('?q=playa&page=2&amenities=wifi&amenities=pool');
  });

  it('returns an empty string when there is no query', () => {
    expect(forwardQuery(asRequest({}), ['q'], [])).toBe('');
  });

  it('rejects unknown parameters', () => {
    expect(() => forwardQuery(asRequest({ evil: '1' }), ['q'], [])).toThrow(BadRequestException);
  });

  it('rejects arrays or objects for scalar parameters', () => {
    expect(() => forwardQuery(asRequest({ q: ['a', 'b'] }), ['q'], [])).toThrow(BadRequestException);
    expect(() => forwardQuery(asRequest({ amenities: [{ x: 1 }] }), [], ['amenities'])).toThrow(BadRequestException);
  });
});
