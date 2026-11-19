import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { GATEWAY_CONFIG, type GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import { ReviewsClient } from '@gateway/infrastructure/http/reviews.client';
import { issueServiceToken } from '@gateway/infrastructure/service-auth/service-token.provider';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
interface SearchFilters {
  q?: string; location?: string; checkIn?: string; checkOut?: string;
  guests?: number; minPrice?: number; maxPrice?: number; currency?: string; amenities?: string[];
  missingCurrency?: boolean;
}

@Injectable()
export class ChatCatalogService {
  constructor(@Inject(GATEWAY_CONFIG) private readonly config: GatewayConfig, private readonly reviews: ReviewsClient) {}

  async context(message: string, history: string[]): Promise<string> {
    // Only prior user turns may supply search filters; assistant replies are not evidence.
    const conversation = [...history.filter(turn => turn.startsWith('Usuario: ')).map(turn => turn.slice(9)), message].join('\n');
    const filters = await this.extractFilters(conversation);
    const params = new URLSearchParams({ pageSize: '10' });
    if (filters.q) params.set('q', filters.q);
    if (filters.location) params.set('location', filters.location);
    if (filters.checkIn && filters.checkOut) {
      params.set('checkIn', filters.checkIn);
      params.set('checkOut', filters.checkOut);
    }
    if (filters.guests !== undefined) params.set('guests', String(filters.guests));
    if (filters.currency) params.set('currency', filters.currency);
    if (filters.minPrice !== undefined) params.set('minPrice', String(filters.minPrice));
    if (filters.maxPrice !== undefined) params.set('maxPrice', String(filters.maxPrice));
    for (const amenity of filters.amenities ?? []) params.append('amenities', amenity);
    try {
      const token = await issueServiceToken({ ...this.config.serviceJwt, audience: process.env.CHAT_SEARCH_AUDIENCE || 'stayhub-search-service', scope: process.env.CHAT_SEARCH_SCOPE || 'search:invoke' });
      const base = (process.env.CHAT_SEARCH_BASE_URL || 'http://127.0.0.1:3004').replace(/\/$/u, '');
      const response = await fetch(`${base}/internal/v1/search?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error('Search unavailable');
      const page = await response.json() as { items?: Array<Record<string, unknown>>; total?: number; availabilityKind?: string | null };
      if (!Array.isArray(page.items)) throw new Error('Invalid search response');
      const items = page.items.slice(0, 10).map(({ accommodationId, name, location, minNightlyPrice, currency, capacity, amenities }) => ({ accommodationId, name, location, minNightlyPrice, currency, capacity, amenities }));
      const details = await Promise.all(items.slice(0, 3).map(async item => {
        if (typeof item.accommodationId !== 'string' || !UUID.test(item.accommodationId)) return null;
        const id = item.accommodationId;
        const accommodationBase = (process.env.CHAT_ACCOMMODATIONS_BASE_URL || 'http://127.0.0.1:3003').replace(/\/$/u, '');
        const [property, reviews] = await Promise.all([
          fetch(`${accommodationBase}/properties/${id}`, { signal: AbortSignal.timeout(4000) }).then(async result => result.ok ? await result.json() as Record<string, unknown> : null).catch(() => null),
          this.reviews.listProperty(id, '?page=1&pageSize=5', randomUUID()).catch(() => null),
        ]);
        return { id, property: property ? { name: property.name, description: property.description, location: property.location, rooms: property.rooms, features: property.features } : null,
          reviews: reviews ? { total: reviews.total, items: reviews.items.map(({ rating, comment }) => ({ rating, comment })) } : null };
      }));
      return JSON.stringify({ filters, total: page.total, availabilityKind: page.availabilityKind, items, details, note: 'Los resultados son una muestra; la disponibilidad PROJECTED es estimada y no confirma una reserva. Ausencia de datos no demuestra que una propiedad esté bloqueada. Si missingCurrency es true, el precio no se filtró: pide la moneda. Si property o reviews son null, esa fuente no está disponible.' });
    } catch {
      return 'La búsqueda de alojamientos no está disponible. No se puede determinar la disponibilidad ni las fechas bloqueadas.';
    }
  }

  private async extractFilters(conversation: string): Promise<SearchFilters> {
    try {
      const base = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/u, '');
      const response = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60000), body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || 'qwen2.5:1.5b', stream: false, format: 'json', options: { temperature: 0, num_predict: 150 },
        messages: [{ role: 'system', content: 'Extrae filtros de búsqueda de alojamiento del texto. Devuelve JSON con q (nombre exacto), location (ubicación exacta), checkIn y checkOut (fechas YYYY-MM-DD), guests (número de huéspedes), minPrice, maxPrice, currency (código ISO de 3 letras), amenities (lista de palabras exactas). Omite campos no explícitos. No inventes valores ni conviertas fechas ambiguas.' }, { role: 'user', content: conversation }],
      }) });
      if (!response.ok) return {};
      const result = await response.json() as { message?: { content?: string } };
      const raw = JSON.parse(result.message?.content ?? '{}') as Record<string, unknown>;
      const literal = (value: unknown, max: number): string | undefined => typeof value === 'string' && value.trim().length > 0 && value.length <= max && conversation.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase()) ? value.trim() : undefined;
      const q = literal(raw.q, 200);
      const location = literal(raw.location, 120);
      const checkIn = literal(raw.checkIn, 10);
      const checkOut = literal(raw.checkOut, 10);
      const validDate = (value: string): boolean => DATE.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
      const words = conversation.toLocaleLowerCase();
      const guestMatch = words.match(/(?:\bpara\s+)?(\d{1,3})\s+(?:hu[eé]spedes?|personas?|adultos?)(?!\p{L})/u);
      const guests = guestMatch ? Number(guestMatch[1]) : undefined;
      const minMatch = words.match(/(?:desde|m[ií]nimo|al menos)\s+(\d+(?:\.\d{1,2})?)(?![\d.,-])/u);
      const maxMatch = words.match(/(?:hasta|m[aá]ximo|menos de|presupuesto de)\s+(\d+(?:\.\d{1,2})?)(?![\d.,-])/u);
      const currencyMatches = [...words.matchAll(/(?<!\p{L})(cop|usd|eur|mxn|ars)(?!\p{L})/gu)].map(match => match[1]!.toUpperCase());
      const uniqueCurrencies = [...new Set(currencyMatches)];
      const currency = uniqueCurrencies.length === 1 ? uniqueCurrencies[0] : undefined;
      const minPrice = minMatch ? Number(minMatch[1]) : undefined;
      const maxPrice = maxMatch ? Number(maxMatch[1]) : undefined;
      const validPrices = (minPrice === undefined || Number.isFinite(minPrice)) && (maxPrice === undefined || Number.isFinite(maxPrice)) && (minPrice === undefined || maxPrice === undefined || minPrice <= maxPrice);
      // Only accept literal, positive amenities; ambiguous negatives must not become filters.
      const amenityTerms = ['wifi', 'wi-fi', 'parking', 'pool', 'piscina', 'estacionamiento', 'cocina', 'mascotas', 'desayuno', 'air_conditioning', 'kitchen', 'pets_allowed', 'breakfast_included'];
      const amenities = Array.isArray(raw.amenities) ? raw.amenities.filter((value): value is string => typeof value === 'string' && amenityTerms.includes(value.toLowerCase()) && words.includes(value.toLowerCase()) && !/(?:sin|no)\s+\S*$/u.test(words.slice(Math.max(0, words.indexOf(value.toLowerCase()) - 10), words.indexOf(value.toLowerCase())))).map(value => value.toLowerCase()) : [];
      return { ...(q ? { q } : {}), ...(location ? { location } : {}), ...(checkIn && checkOut && validDate(checkIn) && validDate(checkOut) && checkIn < checkOut ? { checkIn, checkOut } : {}),
        ...(guests && guests <= 100 ? { guests } : {}), ...(amenities.length ? { amenities: [...new Set(amenities)].slice(0, 20) } : {}),
        ...(validPrices && currency ? { currency, ...(minPrice !== undefined ? { minPrice } : {}), ...(maxPrice !== undefined ? { maxPrice } : {}) } : {}),
        ...((minPrice !== undefined || maxPrice !== undefined) && !currency ? { missingCurrency: true } : {}) };
    } catch { return {}; }
  }
}
