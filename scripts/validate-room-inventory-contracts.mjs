#!/usr/bin/env node
// T075: validates both Room Inventory OpenAPI contracts and the invariants other tasks rely on.
// Usage: node scripts/validate-room-inventory-contracts.mjs  (wired to `npm run openapi:inventory:check`).
import SwaggerParser from '@apidevtools/swagger-parser';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const contracts = resolve(root, 'specs/004-inventario-reportes-recomendaciones-cierre/room_inventory_service/contracts');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const publicApi = await SwaggerParser.validate(resolve(contracts, 'openapi-room-inventory.yaml')).catch((error) => {
  failures.push(`openapi-room-inventory.yaml is invalid: ${error.message}`);
  return null;
});
const providerApi = await SwaggerParser.validate(resolve(contracts, 'accommodations-inventory-context.openapi.yaml')).catch((error) => {
  failures.push(`accommodations-inventory-context.openapi.yaml is invalid: ${error.message}`);
  return null;
});

if (publicApi) {
  const operations = Object.entries(publicApi.paths ?? {}).flatMap(([path, methods]) => Object.entries(methods).map(([method, op]) => `${method.toUpperCase()} ${path} ${op.operationId}`)).sort();
  check(JSON.stringify(operations) === JSON.stringify([
    'GET /inventory/rooms/{roomId} getRoomInventory',
    'POST /inventory/rooms/{roomId}/items addRoomInventoryItem',
    'PUT /inventory/rooms/{roomId} replaceRoomInventory',
  ]), `public operations drifted: ${operations.join(', ')}`);
  const schemas = publicApi.components?.schemas ?? {};
  check(schemas.ReplaceInventoryRequest?.properties?.items?.maxItems === 200, 'ReplaceInventoryRequest.items.maxItems must be 200');
  check(schemas.AddInventoryItemRequest?.additionalProperties === false, 'AddInventoryItemRequest must be closed');
  check(schemas.InventoryItem?.additionalProperties === false && !schemas.InventoryItem?.allOf, 'InventoryItem must be an explicit closed object (not allOf over a closed schema)');
  check(!JSON.stringify(schemas.RoomInventory ?? {}).includes('ownerId'), 'RoomInventory must not expose ownerId');
  for (const [path, methods] of Object.entries(publicApi.paths ?? {})) {
    for (const [method, op] of Object.entries(methods)) {
      for (const [status, response] of Object.entries(op.responses ?? {})) {
        if (Number(status) >= 400) check(Boolean(response.content?.['application/problem+json']), `${method.toUpperCase()} ${path} ${status} must be Problem Details`);
      }
    }
  }
}

if (providerApi) {
  const operation = providerApi.paths?.['/internal/v1/rooms/{roomId}/inventory-context']?.get;
  check(operation?.operationId === 'getRoomInventoryContext', 'provider operation getRoomInventoryContext is missing');
  const context = providerApi.components?.schemas?.RoomInventoryContext;
  check(context?.additionalProperties === false, 'RoomInventoryContext must be closed');
  check(JSON.stringify([...(context?.required ?? [])].sort()) === JSON.stringify(['ownerId', 'propertyId', 'propertyStatus', 'roomExists', 'roomId']), 'RoomInventoryContext required fields drifted');
}

if (failures.length) {
  for (const failure of failures) process.stderr.write(`✗ ${failure}\n`);
  process.exit(1);
}
process.stdout.write('Room Inventory contracts OK (public API: 3 operations; Accommodations provider: 1 operation)\n');
