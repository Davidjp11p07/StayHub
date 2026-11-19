import { Body, Controller, Get, Header, HttpCode, Param, Post, Put, Req, UseGuards } from '@nestjs/common';

import { AddInventoryItemUseCase } from '@inventory/application/use-cases/add-inventory-item.use-case';
import { GetRoomInventoryUseCase } from '@inventory/application/use-cases/get-room-inventory.use-case';
import { ReplaceRoomInventoryUseCase } from '@inventory/application/use-cases/replace-room-inventory.use-case';
import { AddInventoryItemApiDocs, GetRoomInventoryApiDocs, ReplaceRoomInventoryApiDocs } from '@inventory/interfaces/openapi/inventory.openapi';

import { InventoryAccessGuard } from '../guards/inventory-access.guard';
import { principalOf, ServiceAuthGuard, type AuthenticatedRequest } from '../guards/service-auth.guard';
import { traceIdOf } from '../trace.interceptor';
import { AddInventoryItemDto, ReplaceRoomInventoryDto, RoomParamsDto } from './inventory.dto';
import { presentRoomInventory, type RoomInventoryView } from './inventory.presenter';

/** Thin adapter: path validation, authentication, presentation. Ownership and rules live in application/domain. */
@Controller('inventory/rooms')
@UseGuards(ServiceAuthGuard, InventoryAccessGuard)
export class InventoryController {
  public constructor(
    private readonly getRoomInventory: GetRoomInventoryUseCase,
    private readonly addInventoryItem: AddInventoryItemUseCase,
    private readonly replaceRoomInventory: ReplaceRoomInventoryUseCase,
  ) {}

  @Get(':roomId')
  @Header('Cache-Control', 'no-store')
  @GetRoomInventoryApiDocs()
  public async get(@Param() params: RoomParamsDto, @Req() request: AuthenticatedRequest): Promise<RoomInventoryView> {
    const inventory = await this.getRoomInventory.execute({ viewer: principalOf(request), roomId: params.roomId.toLowerCase(), traceId: traceIdOf(request) });
    return presentRoomInventory(inventory);
  }

  @Post(':roomId/items')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @AddInventoryItemApiDocs()
  public async add(
    @Param() params: RoomParamsDto,
    @Body() body: AddInventoryItemDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<RoomInventoryView> {
    const inventory = await this.addInventoryItem.execute({
      viewer: principalOf(request), roomId: params.roomId.toLowerCase(), traceId: traceIdOf(request), item: body,
    });
    return presentRoomInventory(inventory);
  }

  @Put(':roomId')
  @Header('Cache-Control', 'no-store')
  @ReplaceRoomInventoryApiDocs()
  public async replace(@Param() params: RoomParamsDto, @Body() body: ReplaceRoomInventoryDto, @Req() request: AuthenticatedRequest): Promise<RoomInventoryView> {
    const inventory = await this.replaceRoomInventory.execute({
      viewer: principalOf(request), roomId: params.roomId.toLowerCase(), traceId: traceIdOf(request),
      expectedVersion: body.expectedVersion, items: body.items,
    });
    return presentRoomInventory(inventory);
  }
}
