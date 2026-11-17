import { Module } from '@nestjs/common';

import { INVENTORY_REPOSITORY, type InventoryRepository } from '@inventory/application/ports/inventory.repository';
import { ROOM_CONTEXT_PORT, type RoomContextPort } from '@inventory/application/ports/room-context.port';
import { AddInventoryItemUseCase } from '@inventory/application/use-cases/add-inventory-item.use-case';
import { GetRoomInventoryUseCase } from '@inventory/application/use-cases/get-room-inventory.use-case';
import { ReplaceRoomInventoryUseCase } from '@inventory/application/use-cases/replace-room-inventory.use-case';
import { INVENTORY_CONFIG } from '@inventory/infrastructure/config/config.module';
import type { InventoryConfig } from '@inventory/infrastructure/config/inventory-config';
import { AccommodationsRoomContextClient } from '@inventory/infrastructure/http/accommodations-room-context.client';
import { PrismaInventoryRepository } from '@inventory/infrastructure/persistence/prisma/prisma-inventory.repository';
import { OutboundServiceTokenProvider } from '@inventory/infrastructure/security/outbound-service-token.provider';
import { ServiceJwtVerifier } from '@inventory/infrastructure/security/service-jwt.verifier';
import { InventoryAccessGuard } from '@inventory/interfaces/http/guards/inventory-access.guard';
import { ServiceAuthGuard } from '@inventory/interfaces/http/guards/service-auth.guard';
import { InventoryController } from '@inventory/interfaces/http/inventory/inventory.controller';

/** Wires the read and append paths. PUT (US3) joins this module in the next block. */
@Module({
  controllers: [InventoryController],
  providers: [
    ServiceJwtVerifier,
    ServiceAuthGuard,
    InventoryAccessGuard,
    OutboundServiceTokenProvider,
    AccommodationsRoomContextClient,
    { provide: ROOM_CONTEXT_PORT, useExisting: AccommodationsRoomContextClient },
    { provide: INVENTORY_REPOSITORY, useClass: PrismaInventoryRepository },
    {
      provide: GetRoomInventoryUseCase,
      useFactory: (rooms: RoomContextPort, repository: InventoryRepository): GetRoomInventoryUseCase => new GetRoomInventoryUseCase(rooms, repository),
      inject: [ROOM_CONTEXT_PORT, INVENTORY_REPOSITORY],
    },
    {
      provide: AddInventoryItemUseCase,
      useFactory: (rooms: RoomContextPort, repository: InventoryRepository, config: InventoryConfig): AddInventoryItemUseCase =>
        new AddInventoryItemUseCase(rooms, repository, config),
      inject: [ROOM_CONTEXT_PORT, INVENTORY_REPOSITORY, INVENTORY_CONFIG],
    },
    {
      provide: ReplaceRoomInventoryUseCase,
      useFactory: (rooms: RoomContextPort, repository: InventoryRepository, config: InventoryConfig): ReplaceRoomInventoryUseCase =>
        new ReplaceRoomInventoryUseCase(rooms, repository, config),
      inject: [ROOM_CONTEXT_PORT, INVENTORY_REPOSITORY, INVENTORY_CONFIG],
    },
  ],
  exports: [AccommodationsRoomContextClient],
})
export class InventoryModule {}
