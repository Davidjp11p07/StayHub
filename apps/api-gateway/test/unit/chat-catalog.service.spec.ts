import type { GatewayConfig } from '../../src/infrastructure/config/gateway-config';
import type { ReviewsClient } from '../../src/infrastructure/http/reviews.client';
import { ChatCatalogService } from '../../src/modules/chat/chat-catalog.service';

jest.mock('../../src/infrastructure/service-auth/service-token.provider', () => ({ issueServiceToken: jest.fn().mockResolvedValue('service-token') }));

describe('ChatCatalogService', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });

  it('does not treat a city or generic property noun as a name in a count', async () => {
    const fetchMock = jest.fn<Promise<unknown>, [string, RequestInit]>()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [], total: 4 }) });
    global.fetch = fetchMock as typeof fetch;
    const service = new ChatCatalogService({ serviceJwt: {} } as GatewayConfig, {} as ReviewsClient);
    await service.context('¿Cuántos inmuebles hay en Bogotá?', []);
    const searchUrl = new URL(fetchMock.mock.calls[0]![0]);
    expect(searchUrl.searchParams.has('q')).toBe(false);
    expect(searchUrl.searchParams.get('location')).toBe('Bogotá');
  });

  it.each(['cuantos inmbuebles hay en total', 'cuantos inmbuebles hay en total en todo stayhub', 'no, en todo stayhub'])('counts the whole catalog without carrying a city into "%s"', async message => {
    const fetchMock = jest.fn<Promise<unknown>, [string, RequestInit]>().mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [], total: 7 }) });
    global.fetch = fetchMock as typeof fetch;
    const service = new ChatCatalogService({ serviceJwt: {} } as GatewayConfig, {} as ReviewsClient);
    const data = JSON.parse(await service.context(message, ['Usuario: cuantos inmuebles hay en bogota?'])) as { filters: object; total: number };
    expect(data).toMatchObject({ filters: {}, total: 7 });
    expect(new URL(fetchMock.mock.calls[0]![0]).searchParams.has('location')).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('filters public search by explicit dates and loads only public property and review data', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const reviews = { listProperty: jest.fn().mockResolvedValue({ total: 1, items: [{ rating: 5, comment: 'Bien', userId: 'private' }] }) };
    const fetchMock = jest.fn<Promise<unknown>, [string, RequestInit]>()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ message: { content: JSON.stringify({ location: 'Bogotá', checkIn: '2027-01-01', checkOut: '2027-01-05' }) } }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [{ accommodationId: id, name: 'Casa' }], total: 1, availabilityKind: 'PROJECTED' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ name: 'Casa', description: 'Centro', ownerId: 'private' }) });
    global.fetch = fetchMock as typeof fetch;
    const service = new ChatCatalogService({ serviceJwt: {} } as GatewayConfig, reviews as unknown as ReviewsClient);
    const result = await service.context('Busco en Bogotá del 2027-01-01 al 2027-01-05', []);
    const searchUrl = new URL(fetchMock.mock.calls[1]![0]);
    expect(searchUrl.searchParams.get('checkIn')).toBe('2027-01-01');
    expect(searchUrl.searchParams.get('checkOut')).toBe('2027-01-05');
    expect(searchUrl.searchParams.get('location')).toBe('Bogotá');
    expect(fetchMock.mock.calls[2]![1]).not.toHaveProperty('headers');
    expect(reviews.listProperty).toHaveBeenCalledWith(id, '?page=1&pageSize=5', expect.any(String));
    expect(result).toContain('PROJECTED');
    expect(result).not.toContain('private');
  });

  it('does not trust dates invented by the model', async () => {
    const fetchMock = jest.fn<Promise<unknown>, [string, RequestInit]>()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ message: { content: '{"checkIn":"2027-01-01","checkOut":"2027-01-05"}' } }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [], total: 0 }) });
    global.fetch = fetchMock as typeof fetch;
    const service = new ChatCatalogService({ serviceJwt: {} } as GatewayConfig, {} as ReviewsClient);
    await service.context('¿Hay disponibilidad?', []);
    const searchUrl = new URL(fetchMock.mock.calls[1]![0]);
    expect(searchUrl.searchParams.has('checkIn')).toBe(false);
    expect(searchUrl.searchParams.has('checkOut')).toBe(false);
  });

  it('applies explicit guests, price and amenities without inventing filters from assistant turns', async () => {
    const fetchMock = jest.fn<Promise<unknown>, [string, RequestInit]>()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ message: { content: JSON.stringify({ amenities: ['wifi', 'pool'] }) } }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [], total: 0 }) });
    global.fetch = fetchMock as typeof fetch;
    const service = new ChatCatalogService({ serviceJwt: {} } as GatewayConfig, {} as ReviewsClient);
    await service.context('Busco 2 personas con wifi y máximo 200000 COP', ['Asistente: También hay pool para 8 personas']);
    const searchUrl = new URL(fetchMock.mock.calls[1]![0]);
    expect(searchUrl.searchParams.get('guests')).toBe('2');
    expect(searchUrl.searchParams.get('maxPrice')).toBe('200000');
    expect(searchUrl.searchParams.get('currency')).toBe('COP');
    expect(searchUrl.searchParams.getAll('amenities')).toEqual(['wifi']);
  });

  it('asks for currency and never sends an unqualified price', async () => {
    const fetchMock = jest.fn<Promise<unknown>, [string, RequestInit]>()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ message: { content: '{}' } }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [], total: 0 }) });
    global.fetch = fetchMock as typeof fetch;
    const service = new ChatCatalogService({ serviceJwt: {} } as GatewayConfig, {} as ReviewsClient);
    const result = await service.context('Máximo 200000 para 3 personas', []);
    const searchUrl = new URL(fetchMock.mock.calls[1]![0]);
    expect(searchUrl.searchParams.has('maxPrice')).toBe(false);
    expect(result).toContain('"missingCurrency":true');
    expect(searchUrl.searchParams.get('guests')).toBe('3');
  });
});
