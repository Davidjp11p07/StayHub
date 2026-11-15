import { Module } from '@nestjs/common';

import { InventoryModule } from '@inventory/modules/inventory.module';

import { HealthController } from './health.controller';

@Module({ imports: [InventoryModule], controllers: [HealthController] })
export class HealthModule {}
