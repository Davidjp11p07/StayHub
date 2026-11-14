import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';
import type { GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import { toRemoteHttpException } from '@gateway/infrastructure/http/remote-problem.mapper';
import {
  ServiceClientBase,
  type HttpFetch,
  type ServiceResult,
  type ServiceTokenIssuer,
} from '@gateway/infrastructure/http/service-client.base';

const SEARCH_DEPENDENCY = 'search';

export interface SearchItemView {
  readonly accommodationId: string;
  readonly name: string;
  readonly location: string;
  readonly minNightlyPrice: number;
  readonly currency: string;
  readonly capacity: number;
  readonly amenities: readonly string[];
  readonly primaryPhotoUrl: string | null;
  readonly relevance: number;
}

export interface SearchPageView {
  readonly items: readonly SearchItemView[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly hasNext: boolean;
  readonly availabilityKind: 'PROJECTED' | null;
}

export interface SuggestionsView {
  readonly items: readonly { readonly text: string; readonly type: 'PROPERTY' | 'LOCATION' }[];
}

export interface SearchClientDeps {
  readonly fetch?: HttpFetch;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * Adaptador REST Gateway -> Search. Las rutas públicas son anónimas; el Gateway se autentica
 * ante Search con un service JWT propio (audience/scope de Search). No contiene reglas de búsqueda.
 */
export class SearchClient {
  private readonly base: ServiceClientBase;

  public constructor(config: GatewayConfig, serviceToken: ServiceTokenIssuer, deps: SearchClientDeps = {}) {
    this.base = new ServiceClientBase(
      { dependency: SEARCH_DEPENDENCY, baseUrl: config.searchBaseUrl, circuit: config.search, traceHeaderName: 'x-trace-id' },
      {
        serviceToken,
        ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
        ...(deps.now === undefined ? {} : { now: deps.now }),
        ...(deps.sleep === undefined ? {} : { sleep: deps.sleep }),
      },
    );
  }

  /** `query` ya viene filtrado por allowlist y codificado (incluye `?` o es vacío). */
  public search(query: string, traceId: string): Promise<SearchPageView> {
    return this.getJson<SearchPageView>(`/internal/v1/search${query}`, traceId);
  }

  public suggest(query: string, traceId: string): Promise<SuggestionsView> {
    return this.getJson<SuggestionsView>(`/internal/v1/search/suggest${query}`, traceId);
  }

  private async getJson<T>(path: string, traceId: string): Promise<T> {
    let result: ServiceResult;
    try {
      result = await this.base.request({ method: 'GET', path, traceId });
    } catch (error) {
      if (error instanceof GatewayDependencyError) throw error;
      throw new GatewayDependencyError(SEARCH_DEPENDENCY);
    }
    // 401/403 de Search significan credenciales de servicio mal configuradas en el Gateway,
    // no un problema del cliente anónimo: se exponen como dependencia no disponible.
    if (result.status === 401 || result.status === 403) throw new GatewayDependencyError(SEARCH_DEPENDENCY);
    if (result.status >= 400) throw toRemoteHttpException(result);
    try {
      return JSON.parse(new TextDecoder().decode(result.body)) as T;
    } catch {
      throw new GatewayDependencyError(SEARCH_DEPENDENCY);
    }
  }
}
