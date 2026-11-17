import { AsyncLocalStorage } from 'node:async_hooks';
import { importPKCS8, SignJWT } from 'jose';

import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';
import type { GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import { toRemoteHttpException } from '@gateway/infrastructure/http/remote-problem.mapper';
import { ServiceClientBase, type HttpFetch, type ServiceResult } from '@gateway/infrastructure/http/service-client.base';

export interface InventoryRequestContext {
  readonly traceId: string;
  readonly userId: string;
  readonly role: 'OWNER' | 'ADMIN';
}

export interface InventoryClientDeps {
  readonly fetch?: HttpFetch;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

type InventoryMethod = 'GET' | 'POST' | 'PUT';

/**
 * Adaptador transparente Gateway -> Room Inventory. El Gateway solo autentica, valida el UUID y delega
 * `sub`/`role` en un JWT corto; ownership, roles de recurso y reglas de inventario permanecen en Inventory.
 */
export class RoomInventoryClient {
  private readonly principalStore = new AsyncLocalStorage<InventoryRequestContext>();
  private readonly client: ServiceClientBase;

  public constructor(config: GatewayConfig, deps: InventoryClientDeps = {}) {
    this.client = new ServiceClientBase({
      dependency: 'inventory',
      baseUrl: config.inventoryBaseUrl,
      circuit: config.inventory,
      traceHeaderName: 'x-request-id',
      requestHeaderAllowlist: [],
    }, {
      serviceToken: {
        issue: (): Promise<string> => {
          const principal = this.principalStore.getStore();
          if (!principal) throw new GatewayDependencyError('inventory');
          return this.issueDelegatedToken(config, principal);
        },
      },
      ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
      ...(deps.now === undefined ? {} : { now: deps.now }),
      ...(deps.sleep === undefined ? {} : { sleep: deps.sleep }),
    });
  }

  public getRoomInventory(roomId: string, context: InventoryRequestContext): Promise<unknown> {
    return this.request(context, 'GET', `/inventory/rooms/${encodeURIComponent(roomId)}`);
  }

  public addItem(roomId: string, body: unknown, context: InventoryRequestContext): Promise<unknown> {
    return this.request(context, 'POST', `/inventory/rooms/${encodeURIComponent(roomId)}/items`, body);
  }

  public replace(roomId: string, body: unknown, context: InventoryRequestContext): Promise<unknown> {
    return this.request(context, 'PUT', `/inventory/rooms/${encodeURIComponent(roomId)}`, body);
  }

  public request<T>(
    context: InventoryRequestContext,
    method: InventoryMethod,
    path: string,
    body?: unknown,
  ): Promise<T> {
    return this.principalStore.run(context, async () => {
      let result: ServiceResult;
      try {
        result = await this.client.request({
          method,
          path,
          traceId: context.traceId,
          ...(body === undefined ? {} : { body: new TextEncoder().encode(JSON.stringify(body)), contentType: 'application/json' }),
        });
      } catch (error) {
        if (error instanceof GatewayDependencyError) throw error;
        throw new GatewayDependencyError('inventory');
      }
      if (result.status >= 400) throw toRemoteHttpException(result);
      try { return JSON.parse(new TextDecoder().decode(result.body)) as T; }
      catch { throw new GatewayDependencyError('inventory'); }
    });
  }

  private async issueDelegatedToken(config: GatewayConfig, principal: InventoryRequestContext): Promise<string> {
    const key = await importPKCS8(config.serviceJwt.privateKey, 'RS256');
    return new SignJWT({ role: principal.role, scope: config.inventoryServiceJwt.scope })
      .setProtectedHeader({ alg: 'RS256', kid: config.serviceJwt.kid })
      .setIssuer(config.serviceJwt.issuer)
      .setAudience(config.inventoryServiceJwt.audience)
      .setSubject(principal.userId)
      .setIssuedAt()
      .setExpirationTime(`${config.serviceJwt.ttlSeconds}s`)
      .sign(key);
  }
}
