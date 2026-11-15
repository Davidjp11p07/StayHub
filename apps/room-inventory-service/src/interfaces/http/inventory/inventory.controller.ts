import { Controller, Get, Header, Param, Req, UseGuards } from '@nestjs/common';

import { GetRoomInventoryUseCase } from '@inventory/application/use-cases/get-room-inventory.use-case';
import { GetRoomInventoryApiDocs } from '@inventory/interfaces/openapi/inventory.openapi';

import { InventoryAccessGuard } from '../guards/inventory-access.guard';
import { principalOf, ServiceAuthGuard, type AuthenticatedRequest } from '../guards/service-auth.guard';
import { traceIdOf } from '../trace.interceptor';
import { RoomParamsDto } from './inventory.dto';
import { presentRoomInventory, type RoomInventoryView } from './inventory.presenter';

/** Thin adapter: path validation, authentication, presentation. Ownership and rules live in application/domain. */
@Controller('inventory/rooms')
@UseGuards(ServiceAuthGuard, InventoryAccessGuard)
export class InventoryController {
  public constructor(private readonly getRoomInventory: GetRoomInventoryUseCase) {}

  @Get(':roomId')
  @Header('Cache-Control', 'no-store')
  @GetRoomInventoryApiDocs()
  public async get(@Param() params: RoomParamsDto, @Req() request: AuthenticatedRequest): Promise<RoomInventoryView> {
    const inventory = await this.getRoomInventory.execute({ viewer: principalOf(request), roomId: params.roomId.toLowerCase(), traceId: traceIdOf(request) });
    return presentRoomInventory(inventory);
  }
}
