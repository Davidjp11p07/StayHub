import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { connect, type ChannelModel, type ConfirmChannel, type Message } from 'amqplib';
import { PrismaService } from '@accommodations/infrastructure/persistence/prisma/prisma.service';

type OutboxRow = { id: bigint; eventId: string; propertyId: string; eventType: string; data: Record<string, unknown> | null; photoId: string | null; occurredAt: Date };

/** Sends committed snapshots at least once; Search deduplicates eventId and ignores older versions. */
@Injectable()
export class SearchOutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SearchOutboxPublisher.name);
  private timer?: NodeJS.Timeout;
  private running: Promise<void> | undefined;
  private stopped = false;
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    if (!process.env.ACCOMMODATIONS_SEARCH_RABBITMQ_URL) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), 2_000);
  }
  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
  private tick(): void {
    if (this.running || this.stopped) return;
    this.running = this.publishBatch().catch(() => { this.logger.warn('Search projection delivery failed; will retry.'); }).finally(() => { this.running = undefined; });
  }
  async publishBatch(): Promise<void> {
    const rabbitUrl = process.env.ACCOMMODATIONS_SEARCH_RABBITMQ_URL;
    if (!rabbitUrl) return;
    const rows = await this.prisma.$queryRaw<OutboxRow[]>`SELECT "id", "eventId", "propertyId", "eventType", "data", "photoId", "occurredAt" FROM "SearchProjectionOutbox" WHERE "publishedAt" IS NULL ORDER BY "id" LIMIT 50`;
    if (!rows.length) return;
    let connection: ChannelModel | undefined;
    let channel: ConfirmChannel | undefined;
    try {
      connection = await connect(rabbitUrl, { timeout: 3_000 });
      connection.on('error', () => undefined);
      channel = await connection.createConfirmChannel();
      channel.on('error', () => undefined);
      const unroutable = new Set<string>();
      channel.on('return', (message: Message) => { const id: unknown = message.properties.messageId; if (typeof id === 'string') unroutable.add(id); });
      const exchange = process.env.ACCOMMODATIONS_SEARCH_EXCHANGE || 'stayhub.search.v1';
      await channel.assertExchange(exchange, 'direct', { durable: true });
      for (const row of rows) {
        const data = row.data ? { ...row.data } : null;
        const publicBase = process.env.ACCOMMODATIONS_SEARCH_PUBLIC_API_URL;
        if (data && row.photoId && publicBase) data.primaryPhotoUrl = `${publicBase.replace(/\/$/u, '')}/properties/${row.propertyId}/photos/${row.photoId}`;
        const version = Number(row.id);
        if (!Number.isSafeInteger(version)) throw new Error('Projection version exceeds safe integer range');
        const event = { eventId: row.eventId, eventType: row.eventType, schemaVersion: 1, occurredAt: row.occurredAt.toISOString(), accommodationId: row.propertyId, projectionVersion: version, ...(data ? { data } : {}) };
        channel.publish(exchange, row.eventType, Buffer.from(JSON.stringify(event)), { persistent: true, mandatory: true, contentType: 'application/json', messageId: row.eventId });
        await channel.waitForConfirms();
        if (unroutable.has(row.eventId)) throw new Error('Search event was not routed');
        await this.prisma.$executeRaw`UPDATE "SearchProjectionOutbox" SET "publishedAt" = CURRENT_TIMESTAMP WHERE "id" = ${row.id} AND "publishedAt" IS NULL`;
      }
    } finally {
      await channel?.close().catch(() => undefined);
      await connection?.close().catch(() => undefined);
    }
  }
}
