import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

const TAG = 'Inventory';
const PROBLEM = { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } };
const ROOM_ID = ApiParam({ name: 'roomId', schema: { type: 'string', format: 'uuid' } });
const ITEM_TYPE = { type: 'string', enum: ['PRODUCT', 'SERVICE'] };
const ITEM_PROPERTIES = {
  type: ITEM_TYPE,
  name: { type: 'string', minLength: 1, maxLength: 120 },
  quantityAvailable: { type: 'integer', minimum: 0, maximum: 1000000 },
  active: { type: 'boolean' },
};
const ADD_BODY = { type: 'object', additionalProperties: false, required: ['type', 'name', 'quantityAvailable', 'active'], properties: ITEM_PROPERTIES };
const REPLACE_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['expectedVersion', 'items'],
  properties: {
    expectedVersion: { type: 'integer', minimum: 0 },
    items: {
      type: 'array', maxItems: 200,
      items: { type: 'object', additionalProperties: false, required: ['id', 'type', 'name', 'quantityAvailable', 'active'], properties: { id: { type: 'string', format: 'uuid' }, ...ITEM_PROPERTIES } },
    },
  },
};
const INVENTORY = { type: 'object', additionalProperties: false };

function problem(status: number, description: string): MethodDecorator & ClassDecorator {
  return ApiResponse({ status, description, content: PROBLEM });
}

export function GetRoomInventoryApiDocs(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiTags(TAG),
    ApiOperation({ operationId: 'getRoomInventory', summary: 'Get the inventory of an owned room' }),
    ApiBearerAuth('bearerAuth'),
    ROOM_ID,
    ApiResponse({ status: 200, description: 'Current inventory; a room without items returns version 0.', schema: INVENTORY }),
    problem(400, 'Invalid room id.'), problem(401, 'Invalid authentication.'), problem(403, 'OWNER of another room or GUEST.'),
    problem(404, 'Room not found.'), problem(503, 'Accommodations or Inventory is unavailable.'),
  );
}

export function AddRoomInventoryItemApiDocs(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiTags(TAG),
    ApiOperation({ operationId: 'addRoomInventoryItem', summary: 'Append a product or service to an owned room' }),
    ApiBearerAuth('bearerAuth'),
    ROOM_ID,
    ApiBody({ schema: ADD_BODY }),
    ApiResponse({ status: 201, description: 'Item appended and inventory version incremented.', schema: INVENTORY }),
    problem(400, 'Invalid or unknown fields.'), problem(401, 'Invalid authentication.'), problem(403, 'Not the room owner.'),
    problem(404, 'Room not found.'), problem(422, 'Item limit reached.'), problem(503, 'Dependency unavailable.'),
  );
}

export function ReplaceRoomInventoryApiDocs(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiTags(TAG),
    ApiOperation({ operationId: 'replaceRoomInventory', summary: 'Replace the inventory snapshot with optimistic versioning' }),
    ApiBearerAuth('bearerAuth'),
    ROOM_ID,
    ApiBody({ schema: REPLACE_BODY }),
    ApiResponse({ status: 200, description: 'Replaced inventory or idempotent replay.', schema: INVENTORY }),
    problem(400, 'Invalid or unknown fields.'), problem(401, 'Invalid authentication.'), problem(403, 'Not the room owner.'),
    problem(404, 'Room not found.'), problem(409, 'Stale expectedVersion.'), problem(422, 'Item limit reached.'),
    problem(503, 'Dependency unavailable.'),
  );
}
