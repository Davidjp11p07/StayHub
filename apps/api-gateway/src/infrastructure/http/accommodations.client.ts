import { AsyncLocalStorage } from 'node:async_hooks';

import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';
import type { GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import { toRemoteHttpException } from '@gateway/infrastructure/http/remote-problem.mapper';
import {
  ServiceClientBase,
  type HttpFetch,
  type HttpMethod,
  type ServiceResult,
} from '@gateway/infrastructure/http/service-client.base';

const ACCOMMODATIONS_DEPENDENCY = 'accommodations';

export interface AccommodationsRequestContext {
  readonly traceId: string;
  /** Bearer de usuario ya validado por el Gateway; `undefined` = lectura anónima. */
  readonly bearer: string | undefined;
}

export interface AccommodationsBody {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

export interface AccommodationsClientDeps {
  readonly fetch?: HttpFetch;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * Adaptador REST Gateway -> Accommodations. Accommodations verifica por sí mismo el JWT de usuario
 * (mismo issuer/audience que el Gateway), así que el Gateway reenvía SOLO el bearer ya validado y
 * nunca cabeceras de identidad. Sin bearer, la llamada es anónima (lecturas públicas).
 */
export class AccommodationsClient {
  private readonly base: ServiceClientBase;
  private readonly bearerStore = new AsyncLocalStorage<string>();

  public constructor(config: GatewayConfig, deps: AccommodationsClientDeps = {}) {
    this.base = new ServiceClientBase(
      {
        dependency: ACCOMMODATIONS_DEPENDENCY,
        baseUrl: config.accommodationsBaseUrl,
        circuit: config.accommodations,
        traceHeaderName: 'x-trace-id',
      },
      {
        serviceToken: { issue: (): Promise<string> => Promise.resolve(this.bearerStore.getStore() ?? '') },
        ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
        ...(deps.now === undefined ? {} : { now: deps.now }),
        ...(deps.sleep === undefined ? {} : { sleep: deps.sleep }),
      },
    );
  }

  public request<T>(
    method: HttpMethod,
    path: string,
    context: AccommodationsRequestContext,
    body?: AccommodationsBody,
  ): Promise<T> {
    return this.bearerStore.run(context.bearer ?? '', () => this.callJson<T>({
      method,
      path,
      traceId: context.traceId,
      ...(body === undefined ? {} : { body: body.bytes, contentType: body.contentType }),
    }));
  }

  private async callJson<T>(call: Parameters<ServiceClientBase['request']>[0]): Promise<T> {
    let result: ServiceResult;
    try {
      result = await this.base.request(call);
    } catch (error) {
      if (error instanceof GatewayDependencyError) throw error;
      throw new GatewayDependencyError(ACCOMMODATIONS_DEPENDENCY);
    }
    if (result.status >= 400) throw toRemoteHttpException(result);
    try {
      return JSON.parse(new TextDecoder().decode(result.body)) as T;
    } catch {
      throw new GatewayDependencyError(ACCOMMODATIONS_DEPENDENCY);
    }
  }
}
