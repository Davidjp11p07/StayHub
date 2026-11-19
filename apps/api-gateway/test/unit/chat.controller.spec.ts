import { ChatController } from '../../src/modules/chat/chat.controller';
import type { GatewayConfig } from '../../src/infrastructure/config/gateway-config';
import type { Request } from 'express';

describe('ChatController local model', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });

  it('sends the question and bounded history to Ollama and returns its reply', async () => {
    const redis = { eval: jest.fn().mockResolvedValue(1) };
    const config = { redis: { namespace: 'test' }, trustedProxyCidrs: [], serviceJwt: {} } as unknown as GatewayConfig;
    const controller = new ChatController(config, redis, { context: jest.fn().mockResolvedValue('cat?logo no disponible') } as never);
    const fetchMock = jest.fn<Promise<unknown>, [string, RequestInit]>().mockResolvedValue({ ok: true, json: () => Promise.resolve({ message: { content: 'Hola desde StayHub' } }) });
    global.fetch = fetchMock as typeof fetch;
    const request = { socket: { remoteAddress: '127.0.0.1' }, headers: {} } as unknown as Request;
    await expect(controller.chat({ message: '¿Cómo reservo?', history: ['Usuario: hola'] }, request)).resolves.toEqual({ reply: 'Hola desde StayHub' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('http://127.0.0.1:11434/api/chat');
    const payload = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as { messages: Array<{ content: string }> };
    expect(payload.messages[1]!.content).toContain('¿Cómo reservo?');
    expect(payload.messages[1]!.content).toContain('Usuario: hola');
  });

  it('returns an honest empty result without calling the model', async () => {
    const config = { redis: { namespace: 'test' }, trustedProxyCidrs: [] } as unknown as GatewayConfig;
    const controller = new ChatController(config, { eval: jest.fn().mockResolvedValue(1) }, { context: jest.fn().mockResolvedValue(JSON.stringify({ total: 0, filters: { location: 'Bogotá' }, availabilityKind: 'PROJECTED' })) } as never);
    const fetchMock = jest.fn(); global.fetch = fetchMock as typeof fetch;
    const request = { socket: { remoteAddress: '127.0.0.1' }, headers: {} } as unknown as Request;
    const result = await controller.chat({ message: 'Busco en Bogotá' }, request);
    expect(result.reply).toContain('No encontré alojamientos');
    expect(result.explanation).toContain('estimada');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers counts from Search rather than asking the model to invent a result', async () => {
    const config = { redis: { namespace: 'test' }, trustedProxyCidrs: [] } as unknown as GatewayConfig;
    const controller = new ChatController(config, { eval: jest.fn().mockResolvedValue(1) }, { context: jest.fn().mockResolvedValue(JSON.stringify({ total: 4, filters: { location: 'Bogotá' }, items: [] })) } as never);
    const fetchMock = jest.fn(); global.fetch = fetchMock as typeof fetch;
    const request = { socket: { remoteAddress: '127.0.0.1' }, headers: {} } as unknown as Request;
    const result = await controller.chat({ message: '¿Cuántos inmuebles hay en Bogotá?' }, request);
    expect(result.reply).toContain('4 alojamientos publicados en Bogotá');
    expect(result.explanation).toContain('Resultados recuperados: 4');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not invent a count when Search is unavailable', async () => {
    const config = { redis: { namespace: 'test' }, trustedProxyCidrs: [] } as unknown as GatewayConfig;
    const controller = new ChatController(config, { eval: jest.fn().mockResolvedValue(1) }, { context: jest.fn().mockResolvedValue('La búsqueda no está disponible') } as never);
    const fetchMock = jest.fn(); global.fetch = fetchMock as typeof fetch;
    const request = { socket: { remoteAddress: '127.0.0.1' }, headers: {} } as unknown as Request;
    const result = await controller.chat({ message: '¿Cuántos inmuebles hay en Bogotá?' }, request);
    expect(result.reply).toContain('No pude consultar');
    expect(result.explanation).toContain('no se obtuvo un resultado verificable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks for currency without calling the model', async () => {
    const config = { redis: { namespace: 'test' }, trustedProxyCidrs: [] } as unknown as GatewayConfig;
    const controller = new ChatController(config, { eval: jest.fn().mockResolvedValue(1) }, { context: jest.fn().mockResolvedValue(JSON.stringify({ total: 0, filters: { missingCurrency: true } })) } as never);
    const fetchMock = jest.fn(); global.fetch = fetchMock as typeof fetch;
    const request = { socket: { remoteAddress: '127.0.0.1' }, headers: {} } as unknown as Request;
    expect((await controller.chat({ message: 'Máximo 200000' }, request)).reply).toContain('moneda');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('labels projected availability and nightly prices when dates are supplied', async () => {
    const config = { redis: { namespace: 'test' }, trustedProxyCidrs: [] } as unknown as GatewayConfig;
    const context = JSON.stringify({ total: 1, filters: { checkIn: '2027-01-01', checkOut: '2027-01-05' }, availabilityKind: 'PROJECTED', items: [{ name: 'Casa Demo', location: 'Bogota', minNightlyPrice: 250000, currency: 'COP' }] });
    const controller = new ChatController(config, { eval: jest.fn().mockResolvedValue(1) }, { context: jest.fn().mockResolvedValue(context) } as never);
    const fetchMock = jest.fn(); global.fetch = fetchMock as typeof fetch;
    const request = { socket: { remoteAddress: '127.0.0.1' }, headers: {} } as unknown as Request;
    const result = await controller.chat({ message: 'Disponibilidad para esas fechas' }, request);
    expect(result.reply).toContain('250000 COP por noche');
    expect(result.reply).toContain('disponibilidad es estimada');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
