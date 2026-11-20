import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetInventoryContextUseCase, type RoomInventoryContext } from '@accommodations/application/properties/get-inventory-context.use-case';
import { parseUuid } from '@accommodations/domain/shared/uuid';
import { ServiceAuthGuard, ServiceScope } from '../auth/service-auth.guard';

@ApiTags('internal')
@ApiBearerAuth('serviceJwt')
@Controller('internal/v1/rooms')
@UseGuards(ServiceAuthGuard)
export class InventoryContextController {
  constructor(private readonly contexts: GetInventoryContextUseCase) {}

  @Get(':roomId/inventory-context')
  @ServiceScope('accommodations:inventory-context')
  @ApiOperation({ operationId: 'getRoomInventoryContext', summary: 'Authoritative minimal room context for Room Inventory' })
  @ApiParam({ name: 'roomId', required: true, schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ description: 'Room, property, owner and property status; no names or prices.' })
  @ApiResponse({ status: 400 }) @ApiResponse({ status: 401 }) @ApiResponse({ status: 404 }) @ApiResponse({ status: 503 })
  async get(@Param('roomId') roomId: string): Promise<RoomInventoryContext> {
    return this.contexts.execute(parseUuid(roomId, 'roomId'));
  }
}
