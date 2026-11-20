import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

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

export function AddInventoryItemApiDocs(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiTags('Room inventory'),
    ApiBearerAuth('delegatedJwt'),
    ApiOperation({ operationId: 'addRoomInventoryItem', summary: 'Agregar un producto o servicio' }),
    ApiParam({ name: 'roomId', schema: { type: 'string', format: 'uuid' } }),
    ApiBody({ schema: {
      type: 'object', additionalProperties: false, required: ['type', 'name', 'quantityAvailable', 'active'],
      properties: {
        type: { type: 'string', enum: ['PRODUCT', 'SERVICE'] },
        name: { type: 'string', minLength: 1, maxLength: 120 },
        quantityAvailable: { type: 'integer', minimum: 0, maximum: 1_000_000 },
        active: { type: 'boolean' },
      },
    } }),
    ApiResponse({ status: 201, description: `Item added. ${CONTRACT} #/components/schemas/RoomInventory` }),
    problem(400, 'Invalid roomId or closed request body.'),
    problem(401, 'Missing or invalid delegated JWT.'),
    problem(403, 'Role or ownership not allowed.'),
    problem(404, 'Room missing or hidden.'),
    problem(422, 'The room already has the maximum number of items.'),
    problem(503, 'PostgreSQL or Accommodations unavailable.'),
  );
}

export function ReplaceRoomInventoryApiDocs(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiTags('Room inventory'), ApiBearerAuth('delegatedJwt'),
    ApiOperation({ operationId: 'replaceRoomInventory', summary: 'Reemplazar inventario completo con versión optimista' }),
    ApiParam({ name: 'roomId', schema: { type: 'string', format: 'uuid' } }),
    ApiBody({ schema: {
      type: 'object', additionalProperties: false, required: ['expectedVersion', 'items'],
      properties: {
        expectedVersion: { type: 'integer', minimum: 0 },
        items: { type: 'array', maxItems: 200, uniqueItems: true, items: { type: 'object', additionalProperties: false, required: ['id', 'type', 'name', 'quantityAvailable', 'active'], properties: {
          id: { type: 'string', format: 'uuid' }, type: { type: 'string', enum: ['PRODUCT', 'SERVICE'] },
          name: { type: 'string', minLength: 1, maxLength: 120 }, quantityAvailable: { type: 'integer', minimum: 0, maximum: 1_000_000 }, active: { type: 'boolean' },
        } } },
      },
    } }),
    ApiResponse({ status: 200, description: `Replaced or replayed. ${CONTRACT} #/components/schemas/RoomInventory` }),
    problem(400, 'Invalid closed body, duplicate or unknown item id.'), problem(401, 'Missing or invalid delegated JWT.'),
    problem(403, 'Role or ownership not allowed.'), problem(404, 'Room missing or hidden.'),
    problem(409, 'Expected version is stale and desired state differs.'), problem(422, 'Aggregate limit exceeded.'),
    problem(503, 'PostgreSQL or Accommodations unavailable.'),
  );
}
