import { resolve } from 'node:path';

import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPIObject } from '@nestjs/swagger';

import { buildInventoryOpenApi } from '@inventory/interfaces/openapi/openapi.factory';

import { createInventoryTestApp, type InventoryTestApp } from '../fixtures/inventory-app';

const CONTRACT = resolve(__dirname, '../../../../specs/004-inventario-reportes-recomendaciones-cierre/room_inventory_service/contracts/openapi-room-inventory.yaml');

interface Operation { operationId?: string; parameters?: Array<{ name: string; in: string; required?: boolean }>; responses?: Record<string, unknown>; requestBody?: unknown }
type Paths = Record<string, Record<string, Operation>>;
interface Contract { openapi: string; paths: Paths; components: { schemas: Record<string, Record<string, unknown>> } }

/** Implemented in Iteration 1. POST (T049) and PUT (T060) join this list when they exist. */
const IMPLEMENTED = [{ path: '/inventory/rooms/{roomId}', method: 'get', operationId: 'getRoomInventory' }] as const;

describe('Room Inventory OpenAPI drift', () => {
  let ctx: InventoryTestApp;
  let generated: OpenAPIObject;
  let contract: Contract;

  beforeAll(async () => {
    ctx = await createInventoryTestApp();
    generated = buildInventoryOpenApi(ctx.app);
    contract = (await SwaggerParser.validate(CONTRACT)) as unknown as Contract;
  });
  afterAll(async () => { await ctx.close(); });

  it('the public contract is a valid OpenAPI document with exactly the three Sprint 4 operations', () => {
    const operations = Object.entries(contract.paths).flatMap(([path, methods]) => Object.entries(methods).map(([method, op]) => `${method.toUpperCase()} ${path} ${op.operationId}`));
    expect(operations.sort()).toEqual([
      'GET /inventory/rooms/{roomId} getRoomInventory',
      'POST /inventory/rooms/{roomId}/items addRoomInventoryItem',
      'PUT /inventory/rooms/{roomId} replaceRoomInventory',
    ]);
  });

  it.each([
    ['GET', '/inventory/rooms/{roomId}', 'get', ['200', '400', '401', '403', '404', '503']],
    ['POST', '/inventory/rooms/{roomId}/items', 'post', ['201', '400', '401', '403', '404', '422', '503']],
    ['PUT', '/inventory/rooms/{roomId}', 'put', ['200', '400', '401', '403', '404', '409', '422', '503']],
  ])('%s %s documents the expected statuses', (_verb, path, method, statuses) => {
    expect(Object.keys(contract.paths[path]?.[method]?.responses ?? {}).sort()).toEqual([...statuses].sort());
  });

  it('keeps the documented domain limits: 200 items, names 1..120, quantity 0..1 000 000, closed bodies', () => {
    const schemas = contract.components.schemas;
    const add = schemas.AddInventoryItemRequest as { additionalProperties: boolean; properties: Record<string, Record<string, unknown>> };
    const replace = schemas.ReplaceInventoryRequest as { additionalProperties: boolean; properties: { items: { maxItems: number } } };
    expect(add.additionalProperties).toBe(false);
    expect(replace.additionalProperties).toBe(false);
    expect(add.properties.name).toMatchObject({ minLength: 1, maxLength: 120 });
    expect(add.properties.quantityAvailable).toMatchObject({ minimum: 0, maximum: 1000000 });
    expect(replace.properties.items.maxItems).toBe(200);
  });

  it.each(IMPLEMENTED)('generated Swagger exposes $method $path with the contract operationId, parameters and statuses', ({ path, method, operationId }) => {
    const mine = generated.paths[path]?.[method] as Operation | undefined;
    const theirs = contract.paths[path]?.[method];
    expect(mine?.operationId).toBe(operationId);
    const params = (op: Operation | undefined): string[] => (op?.parameters ?? []).map((p) => `${p.in}:${p.name}:${p.required === true}`).sort();
    expect(params(mine)).toEqual(params(theirs));
    expect(Object.keys(mine?.responses ?? {}).sort()).toEqual(Object.keys(theirs?.responses ?? {}).sort());
  });

  it('generated Swagger exposes only contract operations (no undocumented routes)', () => {
    const ids = new Set(Object.values(contract.paths).flatMap((methods) => Object.values(methods).map((op) => op.operationId)));
    const generatedIds = Object.values(generated.paths).flatMap((methods) => Object.values(methods as Record<string, Operation>).map((op) => op.operationId));
    expect(generatedIds.every((id) => ids.has(id))).toBe(true);
  });

  it('documents the delegated JWT security scheme', () => {
    expect(generated.components?.securitySchemes?.delegatedJwt).toMatchObject({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });
  });
});
