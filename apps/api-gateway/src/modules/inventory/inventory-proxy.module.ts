import { Module } from '@nestjs/common';

import { GATEWAY_CONFIG, type GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import { RoomInventoryClient } from '@gateway/infrastructure/http/room-inventory.client';

import { InventoryController } from './inventory.controller';

@Module({
  controllers: [InventoryController],
  providers: [
    {
      provide: RoomInventoryClient,
      useFactory: (config: GatewayConfig): RoomInventoryClient => new RoomInventoryClient(config),
      inject: [GATEWAY_CONFIG],
    },
  ],
})
export class InventoryProxyModule {}
