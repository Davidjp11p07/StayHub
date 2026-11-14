import { BadRequestException, Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';

import { SearchClient, type SearchPageView, type SuggestionsView } from '@gateway/infrastructure/http/search.client';
import { traceIdFromRequest } from '@gateway/interfaces/http/trace-id';
import { Public } from '@gateway/modules/auth/public.decorator';

import { SearchApiDocs, SuggestApiDocs } from './search.openapi';

const SEARCH_SCALARS = ['q', 'location', 'minPrice', 'maxPrice', 'currency', 'checkIn', 'checkOut', 'guests', 'page', 'pageSize'] as const;
const SEARCH_LISTS = ['amenities'] as const;
const SUGGEST_SCALARS = ['q', 'limit'] as const;
const MAX_LIST_ITEMS = 20;

/**
 * Rutas públicas de búsqueda. Solo filtra la forma de la query (allowlist, tipos string);
 * la validación semántica de valores pertenece a Search y vuelve como Problem Details 400.
 */
@Controller('search')
export class SearchController {
  public constructor(private readonly search: SearchClient) {}

  @Get()
  @Public()
  @SearchApiDocs()
  public find(@Req() request: Request): Promise<SearchPageView> {
    return this.search.search(forwardQuery(request, SEARCH_SCALARS, SEARCH_LISTS), traceIdFromRequest(request));
  }

  @Get('suggest')
  @Public()
  @SuggestApiDocs()
  public suggest(@Req() request: Request): Promise<SuggestionsView> {
    return this.search.suggest(forwardQuery(request, SUGGEST_SCALARS, []), traceIdFromRequest(request));
  }
}

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
