import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

const TAG = 'Properties';
const PROBLEM = { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } };
const ID = ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } });
const OBJECT = { type: 'object', description: 'Ver contrato de Accommodations (specs/002-alojamientos/contracts).' } as const;

function problems(...entries: Array<[number, string]>): Array<MethodDecorator & ClassDecorator> {
  return entries.map(([status, description]) => ApiResponse({ status, description, content: PROBLEM }));
}

export function CreatePropertyApiDocs(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiTags(TAG), ApiBearerAuth('bearerAuth'),
    ApiOperation({ operationId: 'createProperty', summary: 'Create a DRAFT property (OWNER)' }),
    ApiBody({ schema: OBJECT }),
    ApiResponse({ status: 201, description: 'Property created.', schema: OBJECT }),
    ...problems([400, 'Invalid payload.'], [401, 'Invalid authentication.'], [403, 'Only owners may create properties.'], [503, 'Accommodations is unavailable.']),
  );
}

export function GetPropertyApiDocs(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiTags(TAG),
    ApiOperation({ operationId: 'getProperty', summary: 'Get a visible property', description: 'Public for PUBLISHED properties. With a bearer, the owner also sees DRAFT/UNPUBLISHED.' }),
    ID,
    ApiResponse({ status: 200, description: 'Property.', schema: OBJECT }),
    ...problems([400, 'Invalid id.'], [401, 'A bearer was sent but is invalid.'], [404, 'Not found or not visible.'], [503, 'Accommodations is unavailable.']),
  );
}

export function ReplacePropertyApiDocs(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiTags(TAG), ApiBearerAuth('bearerAuth'),
    ApiOperation({ operationId: 'replaceProperty', summary: 'Replace the editable representation (OWNER)', description: 'Also publishes/unpublishes via `status`; requires the current `version`.' }),
    ID, ApiBody({ schema: OBJECT }),
    ApiResponse({ status: 200, description: 'Property updated.', schema: OBJECT }),
    ...problems([400, 'Invalid payload.'], [401, 'Invalid authentication.'], [403, 'Not an owner.'], [404, 'Not found or not yours.'], [409, 'Version or state conflict.'], [503, 'Accommodations is unavailable.']),
  );
}

export function AddPhotoApiDocs(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiTags(TAG), ApiBearerAuth('bearerAuth'),
    ApiOperation({ operationId: 'addPropertyPhoto', summary: 'Add a photo (OWNER)', description: 'JPEG, PNG or WebP, at most 5,000,000 bytes.' }),
    ID, ApiConsumes('multipart/form-data'),
    ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } }),
    ApiResponse({ status: 201, description: 'Photo metadata.', schema: OBJECT }),
    ...problems([400, 'Missing or invalid file.'], [401, 'Invalid authentication.'], [403, 'Not an owner.'], [404, 'Not found or not yours.'], [409, 'Photo limit reached.'], [413, 'Photo larger than 5,000,000 bytes.'], [415, 'Unsupported media type.'], [503, 'Accommodations is unavailable.']),
  );
}
