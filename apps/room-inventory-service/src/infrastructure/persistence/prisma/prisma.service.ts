import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { INVENTORY_CONFIG } from '@inventory/infrastructure/config/config.module';
import type { InventoryConfig } from '@inventory/infrastructure/config/inventory-config';

import { Prisma, PrismaClient } from '../generated/client';

/** Connection to inventory_db only. Inventory never reads or writes another service database. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  public constructor(@Inject(INVENTORY_CONFIG) configOrOptions: InventoryConfig | Prisma.PrismaClientOptions) {
    super('databaseUrl' in configOrOptions ? { datasources: { db: { url: configOrOptions.databaseUrl } } } : configOrOptions);
  }

  public onModuleInit(): void {
    // Non-blocking: an unavailable database must not stop the HTTP server; /health/ready reports it.
    void this.$connect().catch(() => undefined);
  }

  /** Closes the connection pool on shutdown. */
  public async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** True when PostgreSQL answers and the inventory schema has been migrated. */
  public async isReady(): Promise<boolean> {
    try {
      const rows = await this.$queryRaw<Array<{ ready: boolean }>>`
        SELECT to_regclass('public.room_inventories') IS NOT NULL
           AND to_regclass('public.inventory_items') IS NOT NULL AS ready`;
      return rows[0]?.ready === true;
    } catch {
      return false;
    }
  }
}
