import { connect } from 'amqplib';
import { SearchOutboxPublisher } from '../../src/infrastructure/messaging/search-outbox.publisher';
import type { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';

jest.mock('amqplib', () => ({ connect: jest.fn() }));

describe('search outbox delivery', () => {
  const original = process.env.ACCOMMODATIONS_SEARCH_RABBITMQ_URL;
  afterEach(() => { if (original === undefined) delete process.env.ACCOMMODATIONS_SEARCH_RABBITMQ_URL; else process.env.ACCOMMODATIONS_SEARCH_RABBITMQ_URL = original; jest.resetAllMocks(); });
  it('marks a snapshot delivered only after broker confirmation', async () => {
    process.env.ACCOMMODATIONS_SEARCH_RABBITMQ_URL = 'amqp://example.test';
    const row = { id: 1n, eventId: '00000000-0000-4000-8000-000000000001', propertyId: '00000000-0000-4000-8000-000000000002', eventType: 'accommodation.search.v1.removed', data: null, photoId: null, occurredAt: new Date('2026-01-01T00:00:00Z') };
    const update = jest.fn().mockResolvedValue(1);
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([row]), $executeRaw: update } as unknown as PrismaService;
    const confirm = jest.fn().mockImplementation(() => { expect(update).not.toHaveBeenCalled(); return Promise.resolve(); });
    const channel = { on: jest.fn(), assertExchange: jest.fn(), publish: jest.fn(), waitForConfirms: confirm, close: jest.fn().mockResolvedValue(undefined) };
    const connection = { on: jest.fn(), createConfirmChannel: jest.fn().mockResolvedValue(channel), close: jest.fn().mockResolvedValue(undefined) };
    jest.mocked(connect).mockResolvedValue(connection as never);
    await new SearchOutboxPublisher(prisma).publishBatch();
    expect(channel.publish).toHaveBeenCalledWith('stayhub.search.v1', row.eventType, expect.any(Buffer), expect.objectContaining({ mandatory: true, persistent: true, messageId: row.eventId }));
    expect(update).toHaveBeenCalledTimes(1);
  });
  it('keeps a snapshot pending when confirmation fails', async () => {
    process.env.ACCOMMODATIONS_SEARCH_RABBITMQ_URL = 'amqp://example.test';
    const row = { id: 1n, eventId: 'a', propertyId: 'b', eventType: 'accommodation.search.v1.removed', data: null, photoId: null, occurredAt: new Date() };
    const update = jest.fn();
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([row]), $executeRaw: update } as unknown as PrismaService;
    const channel = { on: jest.fn(), assertExchange: jest.fn(), publish: jest.fn(), waitForConfirms: jest.fn().mockRejectedValue(new Error('offline')), close: jest.fn().mockResolvedValue(undefined) };
    jest.mocked(connect).mockResolvedValue({ on: jest.fn(), createConfirmChannel: jest.fn().mockResolvedValue(channel), close: jest.fn().mockResolvedValue(undefined) } as never);
    await expect(new SearchOutboxPublisher(prisma).publishBatch()).rejects.toThrow('offline');
    expect(update).not.toHaveBeenCalled();
  });
  it('keeps a snapshot pending when the broker cannot route it', async () => {
    process.env.ACCOMMODATIONS_SEARCH_RABBITMQ_URL = 'amqp://example.test';
    const row = { id: 1n, eventId: 'event-1', propertyId: 'b', eventType: 'accommodation.search.v1.removed', data: null, photoId: null, occurredAt: new Date() };
    const update = jest.fn();
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([row]), $executeRaw: update } as unknown as PrismaService;
    let onReturn: ((message: { properties: { messageId: string } }) => void) | undefined;
    const channel = {
      on: jest.fn((event: string, callback: (message: { properties: { messageId: string } }) => void) => { if (event === 'return') onReturn = callback; }),
      assertExchange: jest.fn(), publish: jest.fn(() => { onReturn?.({ properties: { messageId: row.eventId } }); }),
      waitForConfirms: jest.fn().mockResolvedValue(undefined), close: jest.fn().mockResolvedValue(undefined),
    };
    jest.mocked(connect).mockResolvedValue({ on: jest.fn(), createConfirmChannel: jest.fn().mockResolvedValue(channel), close: jest.fn().mockResolvedValue(undefined) } as never);
    await expect(new SearchOutboxPublisher(prisma).publishBatch()).rejects.toThrow('not routed');
    expect(update).not.toHaveBeenCalled();
  });
});
