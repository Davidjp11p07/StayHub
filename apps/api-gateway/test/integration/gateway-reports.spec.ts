import { importSPKI, jwtVerify } from 'jose';
import { ReportsClient } from '../../src/infrastructure/http/reports.client';
import { createTestGatewayConfig } from '../support/gateway-config-fixture';

describe('Gateway Reports delegation', () => {
  it('signs only the validated principal and reports scope for the configured target', async () => {
    const fixture = createTestGatewayConfig();
    let received: RequestInit | undefined;
    const fetcher: typeof fetch = (url, init) => { const target = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url; expect(target).toContain('/reports/owner/'); received = init; return Promise.resolve(new Response(JSON.stringify({ ownerId: 'test' }), { status: 200 })); };
    const client = new ReportsClient({ ...fixture.config, reportsBaseUrl: 'http://reports-service:3011' }, { fetch: fetcher });
    await client.request({ traceId: 'reports-test', userId: '11111111-1111-4111-8111-111111111111', role: 'OWNER' }, 'GET', '/reports/owner/11111111-1111-4111-8111-111111111111?from=2026-11-01&to=2026-11-11');
    const bearer = new Headers(received?.headers).get('authorization')!;
    const result = await jwtVerify(bearer.slice(7), await importSPKI(fixture.servicePublicKeyPem, 'RS256'), { issuer: fixture.config.serviceJwt.issuer, audience: 'stayhub-reports-service' });
    expect(result.payload.sub).toBe('11111111-1111-4111-8111-111111111111'); expect(result.payload.role).toBe('OWNER'); expect(result.payload.scope).toBe('reports:read');
    expect(new Headers(received?.headers).get('x-request-id')).toBe('reports-test');
  });
  it('preserves authorization failures from Reports', async () => {
    const fixture = createTestGatewayConfig();
    const client = new ReportsClient(fixture.config, { fetch: (): Promise<Response> => Promise.resolve(new Response(JSON.stringify({ status: 403, title: 'Forbidden', code: 'FORBIDDEN' }), { status: 403, headers: { 'content-type': 'application/problem+json' } })) });
    await expect(client.request({ traceId: 'reports-test', userId: '11111111-1111-4111-8111-111111111111', role: 'OWNER' }, 'GET', '/reports/revenue')).rejects.toMatchObject({ status: 403 });
  });
});
