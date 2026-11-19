import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const TAG = 'Search';
const PROBLEM = { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } };
const SEARCH_ITEM: SchemaObject = {
  type: 'object',
  required: ['accommodationId', 'name', 'location', 'minNightlyPrice', 'currency', 'capacity', 'amenities', 'primaryPhotoUrl', 'relevance'],
  properties: {
    accommodationId: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    location: { type: 'string' },
    minNightlyPrice: { type: 'number' },
    currency: { type: 'string', pattern: '^[A-Z]{3}$' },
    capacity: { type: 'integer', minimum: 1 },
    amenities: { type: 'array', items: { type: 'string' } },
    primaryPhotoUrl: { type: 'string', format: 'uri', nullable: true },
    relevance: { type: 'number' },
  },
};
const SEARCH_PAGE: SchemaObject = {
  type: 'object',
  required: ['items', 'page', 'pageSize', 'total', 'hasNext', 'availabilityKind'],
  properties: {
    items: { type: 'array', items: SEARCH_ITEM },
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100 },
    total: { type: 'integer', minimum: 0 },
    hasNext: { type: 'boolean' },
    availabilityKind: { type: 'string', enum: ['PROJECTED'], nullable: true, description: 'Disponibilidad proyectada [checkIn, checkOut); no confirma una reserva.' },
  },
};
const SUGGESTIONS: SchemaObject = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: { type: 'object', required: ['text', 'type'], properties: { text: { type: 'string' }, type: { type: 'string', enum: ['PROPERTY', 'LOCATION'] } } },
    },
  },
};

function problem(status: number, description: string): ReturnType<typeof ApiResponse> {
  return ApiResponse({ status, description, content: PROBLEM });
}

export function SearchApiDocs(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiTags(TAG),
    ApiOperation({
      operationId: 'searchAccommodations',
      summary: 'Search published accommodations',
      description: 'Public. All filters combine with AND. minPrice/maxPrice require currency; checkIn and checkOut go together. Date availability is PROJECTED, never authoritative.',
    }),
    ApiQuery({ name: 'q', required: false, schema: { type: 'string', minLength: 1, maxLength: 200 } }),
    ApiQuery({ name: 'location', required: false, schema: { type: 'string', minLength: 1, maxLength: 120 } }),
    ApiQuery({ name: 'countryCode', required: false, schema: { type: 'string', pattern: '^[A-Za-z]{2}$' } }),
    ApiQuery({ name: 'minPrice', required: false, schema: { type: 'number', minimum: 0 } }),
    ApiQuery({ name: 'maxPrice', required: false, schema: { type: 'number', minimum: 0 } }),
    ApiQuery({ name: 'currency', required: false, schema: { type: 'string', pattern: '^[A-Z]{3}$' } }),
    ApiQuery({ name: 'checkIn', required: false, schema: { type: 'string', format: 'date' } }),
    ApiQuery({ name: 'checkOut', required: false, schema: { type: 'string', format: 'date' } }),
    ApiQuery({ name: 'guests', required: false, schema: { type: 'integer', minimum: 1 } }),
    ApiQuery({ name: 'amenities', required: false, style: 'form', explode: true, schema: { type: 'array', maxItems: 20, items: { type: 'string', minLength: 1, maxLength: 60 } } }),
    ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1, default: 1 } }),
    ApiQuery({ name: 'pageSize', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } }),
    ApiResponse({ status: 200, description: 'Page of summarized results.', schema: SEARCH_PAGE }),
    problem(400, 'Invalid or unknown query parameter.'),
    problem(503, 'Search is unavailable.'),
  );
}

export function SuggestApiDocs(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiTags(TAG),
    ApiOperation({ operationId: 'suggestSearchTerms', summary: 'Autocomplete property names and locations' }),
    ApiQuery({ name: 'q', required: true, schema: { type: 'string', minLength: 1, maxLength: 120 } }),
    ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 20, default: 10 } }),
    ApiResponse({ status: 200, description: 'Suggestions.', schema: SUGGESTIONS }),
    problem(400, 'Invalid or unknown query parameter.'),
    problem(503, 'Search is unavailable.'),
  );
}
