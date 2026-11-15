import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

/**
 * Swagger metadata of the implemented operations. Schemas are not duplicated: the source of truth is
 * specs/004-inventario-reportes-recomendaciones-cierre/room_inventory_service/contracts/openapi-room-inventory.yaml,
 * and contract tests validate presenter output against it.
 */
const CONTRACT = 'Schema: openapi-room-inventory.yaml';
const PROBLEM = { 'application/problem+json': { schema: { type: 'object', required: ['type', 'title', 'status', 'code', 'traceId'] } } };
const problem = (status: number, description: string): MethodDecorator & ClassDecorator => ApiResponse({ status, description, content: PROBLEM });

export function GetRoomInventoryApiDocs(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiTags('Room inventory'),
    ApiBearerAuth('delegatedJwt'),
    ApiOperation({
      operationId: 'getRoomInventory',
      summary: 'Consultar inventario de una habitación',
      description: 'OWNER of the room (per Accommodations) or ADMIN. A valid room without inventory returns version 0 and no items. Includes inactive items.',
    }),
    ApiParam({ name: 'roomId', schema: { type: 'string', format: 'uuid' } }),
    ApiResponse({ status: 200, description: `Current inventory. ${CONTRACT} #/components/schemas/RoomInventory` }),
    problem(400, 'Invalid roomId.'),
    problem(401, 'Missing or invalid delegated JWT.'),
    problem(403, 'Role or ownership not allowed.'),
    problem(404, 'Room missing or hidden.'),
    problem(503, 'PostgreSQL or Accommodations unavailable.'),
  );
}
