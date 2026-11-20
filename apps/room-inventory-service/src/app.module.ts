import { Global, Module } from '@nestjs/common';

import { InventoryConfigModule } from '@inventory/infrastructure/config/config.module';
import { InventoryLogger } from '@inventory/infrastructure/observability/inventory-logger';
import { InventoryMetrics } from '@inventory/infrastructure/observability/inventory-metrics';
import { PrismaModule } from '@inventory/infrastructure/persistence/prisma/prisma.module';
import { HealthModule } from '@inventory/modules/health/health.module';
import { InventoryModule } from '@inventory/modules/inventory.module';

@Global()
@Module({ providers: [InventoryLogger, InventoryMetrics], exports: [InventoryLogger, InventoryMetrics] })
class ObservabilityModule {}

@Module({ imports: [InventoryConfigModule, ObservabilityModule, PrismaModule, InventoryModule, HealthModule] })
export class AppModule {}
