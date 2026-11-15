import { AsyncLocalStorage } from 'node:async_hooks';
import { importPKCS8, SignJWT } from 'jose';
import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';
import type { GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import { toRemoteHttpException } from '@gateway/infrastructure/http/remote-problem.mapper';
import { ServiceClientBase, type HttpFetch, type ServiceResult } from '@gateway/infrastructure/http/service-client.base';
export interface ReportsRequestContext {
    readonly traceId: string;
    readonly userId: string;
    readonly role: 'GUEST' | 'OWNER' | 'ADMIN';
}
export interface ReportsClientDeps {
    readonly fetch?: HttpFetch;
    readonly now?: () => number;
    readonly sleep?: (ms: number) => Promise<void>;
}
/** Adaptador transparente Gateway -> Bookings; la autorizaciÃ³n de recurso permanece en Bookings. */
export class ReportsClient {
    private readonly principalStore = new AsyncLocalStorage<ReportsRequestContext>();
    private readonly client: ServiceClientBase;
    public constructor(config: GatewayConfig, deps: ReportsClientDeps = {}) {
        this.client = new ServiceClientBase({
            dependency: 'reports', baseUrl: config.reportsBaseUrl ?? 'http://reports-service:3011', circuit: config.reports ?? { timeoutMs: 15000, failureThreshold: 5, resetMs: 30000 },
            traceHeaderName: 'x-request-id', requestHeaderAllowlist: [],
        }, {
            serviceToken: { issue: (): Promise<string> => {
                    const principal = this.principalStore.getStore();
                    if (!principal)
                        throw new GatewayDependencyError('reports');
                    return this.issueDelegatedToken(config, principal);
                } },
            ...(deps.fetch ? { fetch: deps.fetch } : {}), ...(deps.now ? { now: deps.now } : {}), ...(deps.sleep ? { sleep: deps.sleep } : {}),
        });
    }
    public request<T>(context: ReportsRequestContext, method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
        return this.principalStore.run(context, async () => {
            let result: ServiceResult;
            try {
                result = await this.client.request({ method, path, traceId: context.traceId,
                    ...(body === undefined ? {} : { body: new TextEncoder().encode(JSON.stringify(body)), contentType: 'application/json' }),
                    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
                });
            }
            catch (error) {
                if (error instanceof GatewayDependencyError)
                    throw error;
                throw new GatewayDependencyError('reports');
            }
            if (result.status >= 400)
                throw toRemoteHttpException(result);
            try {
                return JSON.parse(new TextDecoder().decode(result.body)) as T;
            }
            catch {
                throw new GatewayDependencyError('reports');
            }
        });
    }
    private async issueDelegatedToken(config: GatewayConfig, principal: ReportsRequestContext): Promise<string> {
        const key = await importPKCS8(config.serviceJwt.privateKey, 'RS256');
        return new SignJWT({ role: principal.role, scope: config.reportsServiceJwt?.scope ?? 'reports:read' })
            .setProtectedHeader({ alg: 'RS256', kid: config.serviceJwt.kid })
            .setIssuer(config.serviceJwt.issuer)
            .setAudience(config.reportsServiceJwt?.audience ?? 'stayhub-reports-service')
            .setSubject(principal.userId)
            .setIssuedAt()
            .setExpirationTime(`${config.serviceJwt.ttlSeconds}s`)
            .sign(key);
    }
}
