import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, Put, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import { RoomInventoryClient, type InventoryRequestContext } from '@gateway/infrastructure/http/room-inventory.client';
import { traceIdFromRequest } from '@gateway/interfaces/http/trace-id';
import { principalFrom } from '@gateway/modules/auth/access.guard';
import { Roles } from '@gateway/modules/auth/roles.guard';
import {
  AddRoomInventoryItemApiDocs,
  GetRoomInventoryApiDocs,
  ReplaceRoomInventoryApiDocs,
} from './inventory.openapi';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Proxy delgado de inventario. El Gateway autentica, autoriza el rol y delega `sub`/`role`; no decide
 * ownership ni aplica reglas de inventario. El cuerpo se reenvía sin transformar y Room Inventory lo valida.
 */
@Controller('inventory/rooms')
export class InventoryController {
  public constructor(private readonly inventory: RoomInventoryClient) {}

  @Get(':roomId')
  @Roles('OWNER', 'ADMIN')
  @GetRoomInventoryApiDocs()
  public get(@Param('roomId') roomId: string, @Req() request: Request): Promise<unknown> {
    return this.inventory.getRoomInventory(roomIdOf(roomId), contextOf(request));
  }

  @Post(':roomId/items')
  @HttpCode(201)
  @Roles('OWNER', 'ADMIN')
  @AddRoomInventoryItemApiDocs()
  public add(@Param('roomId') roomId: string, @Body() body: unknown, @Req() request: Request): Promise<unknown> {
    return this.inventory.addItem(roomIdOf(roomId), body, contextOf(request));
  }

  @Put(':roomId')
  @Roles('OWNER', 'ADMIN')
  @ReplaceRoomInventoryApiDocs()
  public replace(@Param('roomId') roomId: string, @Body() body: unknown, @Req() request: Request): Promise<unknown> {
    return this.inventory.replace(roomIdOf(roomId), body, contextOf(request));
  }
}

function roomIdOf(value: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new BadRequestException({ code: 'VALIDATION_FAILED', errors: [{ field: 'roomId', code: 'invalid_uuid' }] });
  }
  return value;
}

function contextOf(request: Request): InventoryRequestContext {
  const principal = principalFrom(request);
  if (!principal) throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED' });
  if (principal.role !== 'OWNER' && principal.role !== 'ADMIN') throw new ForbiddenException({ code: 'ROLE_NOT_ALLOWED' });
  return { traceId: traceIdFromRequest(request), userId: principal.userId, role: principal.role };
}
