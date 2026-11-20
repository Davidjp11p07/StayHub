import { EventEmitter } from 'node:events';
import type { ChannelModel, ConfirmChannel } from 'amqplib';
import type { UpsertProjection } from '../../src/application/projections/upsert-projection.use-case';
import type { RemoveProjection } from '../../src/application/projections/remove-projection.use-case';
import type { SearchConfig } from '../../src/infrastructure/config/search-config';
import { RabbitMqProjectionConsumer } from '../../src/infrastructure/messaging/rabbitmq-projection.consumer';
import type { SearchLogger } from '../../src/infrastructure/observability/search-logger';

describe('projection consumer reconnection', () => {
  afterEach(() => jest.useRealTimers());
  it('retries after startup failure and reconnects after a connection closes', async () => {
    jest.useFakeTimers();
    const consume = jest.fn().mockResolvedValue({ consumerTag: 'tag' });
    const channel = Object.assign(new EventEmitter(), {
      assertExchange: jest.fn().mockResolvedValue(undefined), assertQueue: jest.fn().mockResolvedValue(undefined),
      bindQueue: jest.fn().mockResolvedValue(undefined), prefetch: jest.fn().mockResolvedValue(undefined),
      consume, cancel: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    }) as unknown as ConfirmChannel;
    const connection = Object.assign(new EventEmitter(), {
      createConfirmChannel: jest.fn().mockResolvedValue(channel), close: jest.fn().mockResolvedValue(undefined),
    }) as unknown as ChannelModel;
    const connector = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(connection);
    const config = { rabbitmqUrl: 'amqp://fixture', rabbitmqExchange: 'exchange', rabbitmqQueue: 'queue', rabbitmqDlq: 'dlq', rabbitmqPrefetch: 1, dependencyTimeoutMs: 100 } as SearchConfig;
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as SearchLogger;
    const consumer = new RabbitMqProjectionConsumer(config, {} as UpsertProjection, {} as RemoveProjection, logger, connector);
    consumer.onModuleInit();
    await jest.advanceTimersByTimeAsync(2_000);
    expect(connector).toHaveBeenCalledTimes(2);
    expect(consume).toHaveBeenCalledTimes(1);
    connection.emit('close');
    await jest.advanceTimersByTimeAsync(2_000);
    expect(connector).toHaveBeenCalledTimes(3);
    expect(consume).toHaveBeenCalledTimes(2);
    await consumer.onModuleDestroy();
  });
});
