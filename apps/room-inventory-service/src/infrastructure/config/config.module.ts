import { Global, Module } from '@nestjs/common';

import { loadInventoryConfig, type InventoryConfig } from './inventory-config';

export const INVENTORY_CONFIG = Symbol('INVENTORY_CONFIG');

@Global()
@Module({
  providers: [{ provide: INVENTORY_CONFIG, useFactory: (): InventoryConfig => loadInventoryConfig() }],
  exports: [INVENTORY_CONFIG],
})
export class InventoryConfigModule {}
