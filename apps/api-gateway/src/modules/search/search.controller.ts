import { BadRequestException, Controller, Get, Req } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { SearchClient } from '@gateway/infrastructure/http/search.client';
import { traceIdFromRequest } from '@gateway/interfaces/http/trace-id';
import { Public } from '@gateway/modules/auth/public.decorator';

/**
 * Búsqueda pública (RQ-04): `GET /search` y `GET /search/suggest` hacia Search con service JWT.
 *
 * El Gateway solo aplica la allowlist de parámetros (desconocido → 400) y conserva los repetidos
 * (`amenities=a&amenities=b`); la validación de valores es de Search, que responde 400 con su código.
 */

const SEARCH_PARAMETERS = [
  'q', 'location', 'countryCode', 'minPrice', 'maxPrice', 'currency', 'checkIn', 'checkOut', 'guests', 'amenities', 'page', 'pageSize',
] as const;
const SUGGEST_PARAMETERS = ['q', 'limit'] as const;
const REPEATABLE = new Set<string>(['amenities']);
const MAX_LIST_ITEMS = 20;
const PROBLEM = { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } };

@ApiTags('Search')
@Controller('search')
@Public()
export class SearchController {
  public constructor(private readonly searchClient: SearchClient) {}

  @Get()
  @ApiOperation({ operationId: 'searchAccommodations', summary: 'Search published accommodations' })
  @ApiQuery({ name: 'q', required: false, schema: { type: 'string', maxLength: 200 } })
  @ApiQuery({ name: 'location', required: false, schema: { type: 'string', maxLength: 120 } })
  @ApiQuery({ name: 'countryCode', required: false, schema: { type: 'string', pattern: '^[A-Za-z]{2}$' } })
  @ApiQuery({ name: 'amenities', required: false, schema: { type: 'array', items: { type: 'string' } }, style: 'form', explode: true })
  @ApiResponse({ status: 200, description: 'Paginated search results.' })
  @ApiResponse({ status: 400, description: 'Invalid or unknown filters.', content: PROBLEM })
  @ApiResponse({ status: 503, description: 'Search is unavailable.', content: PROBLEM })
  public search(@Req() request: Request): Promise<unknown> {
    return this.searchClient.search(allowedQuery(request, SEARCH_PARAMETERS), traceIdFromRequest(request));
  }

  @Get('suggest')
  @ApiOperation({ operationId: 'suggestSearchTerms', summary: 'Suggest search terms' })
  @ApiQuery({ name: 'q', required: true, schema: { type: 'string', minLength: 1, maxLength: 120 } })
  @ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 20 } })
  @ApiResponse({ status: 200, description: 'Suggestions.' })
  @ApiResponse({ status: 400, description: 'Invalid or unknown parameters.', content: PROBLEM })
  @ApiResponse({ status: 503, description: 'Search is unavailable.', content: PROBLEM })
  public suggest(@Req() request: Request): Promise<unknown> {
    return this.searchClient.suggest(allowedQuery(request, SUGGEST_PARAMETERS), traceIdFromRequest(request));
  }
}

/** Reconstruye la query desde la URL cruda para conservar repetidos sin depender del parser de Express. */
function allowedQuery(request: Request, names: readonly string[]): string {
  const raw = request.originalUrl.includes('?') ? request.originalUrl.slice(request.originalUrl.indexOf('?') + 1) : '';
  const incoming = new URLSearchParams(raw);
  const allowed = new Set(names);
  const output = new URLSearchParams();
  for (const [name, value] of incoming) {
    if (!allowed.has(name)) throw new BadRequestException({ code: 'UNKNOWN_QUERY_PARAMETER' });
    if (!REPEATABLE.has(name) && output.has(name)) throw new BadRequestException({ code: 'INVALID_QUERY_PARAMETER' });
    output.append(name, value);
  }
  const query = output.toString();
  return query === '' ? '' : `?${query}`;
}

/**
 * Compatibilidad con las pruebas y consumidores previos que construyen la consulta desde
 * `request.query`. Las rutas HTTP usan `allowedQuery` para conservar el orden y los repetidos
 * de la URL original.
 */
export function forwardQuery(request: Request, scalars: readonly string[], lists: readonly string[]): string {
  const known = new Set([...scalars, ...lists]);
  if (Object.keys(request.query).some((key) => !known.has(key))) {
    throw new BadRequestException({ code: 'UNKNOWN_QUERY_PARAMETER' });
  }
  const params = new URLSearchParams();
  for (const name of scalars) {
    const value = request.query[name];
    if (typeof value === 'string') params.set(name, value);
    else if (value !== undefined) throw new BadRequestException({ code: 'INVALID_QUERY_PARAMETER' });
  }
  for (const name of lists) {
    const value = request.query[name];
    if (value === undefined) continue;
    const values = Array.isArray(value) ? value : [value];
    if (values.length > MAX_LIST_ITEMS || values.some((item) => typeof item !== 'string')) {
      throw new BadRequestException({ code: 'INVALID_QUERY_PARAMETER' });
    }
    for (const item of values as string[]) params.append(name, item);
  }
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}
