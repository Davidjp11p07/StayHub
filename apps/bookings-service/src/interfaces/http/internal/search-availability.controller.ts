import { readFileSync } from 'node:fs';
import { BadRequestException, Body, CanActivate, Controller, ExecutionContext, ForbiddenException, HttpCode, Injectable, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsDateString, IsUUID, Matches } from 'class-validator';
import { importSPKI, jwtVerify } from 'jose';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProperty } from '@nestjs/swagger';
import type { Request } from 'express';
import { PrismaService } from '@bookings/infrastructure/persistence/prisma/prisma.service';

@Injectable()
export class SearchAvailabilityGuard implements CanActivate {
  private readonly publicKey = process.env.SEARCH_AVAILABILITY_PUBLIC_KEY_FILE
    ? readFileSync(process.env.SEARCH_AVAILABILITY_PUBLIC_KEY_FILE, 'utf8') : undefined;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const bearer = context.switchToHttp().getRequest<Request>().headers.authorization;
    if (!this.publicKey || !bearer?.startsWith('Bearer ')) throw new UnauthorizedException();
    const verified = await jwtVerify(bearer.slice(7), await importSPKI(this.publicKey, 'RS256'), {
      algorithms: ['RS256'], issuer: 'stayhub-search-service', audience: 'stayhub-bookings-availability',
      requiredClaims: ['sub', 'iat', 'exp'], maxTokenAge: 60,
    }).catch(() => { throw new UnauthorizedException(); });
    const { payload, protectedHeader } = verified;
    if (protectedHeader.kid !== 'search-availability-v1' || typeof payload.exp !== 'number'
      || typeof payload.iat !== 'number' || payload.exp - payload.iat > 60) throw new UnauthorizedException();
    if (payload.sub !== 'search-service' || payload.scope !== 'availability:read') throw new ForbiddenException();
    return true;
  }
}

export class SearchAvailabilityRequest {
  @ApiProperty({ type: String, format: 'date' })
  @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/u) checkIn!: string;
  @ApiProperty({ type: String, format: 'date' })
  @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/u) checkOut!: string;
  @ApiProperty({ type: 'array', minItems: 1, maxItems: 256, uniqueItems: true, items: { type: 'string', format: 'uuid' } })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(256) @ArrayUnique() @IsUUID(undefined, { each: true }) roomIds!: string[];
}

@Controller('internal/v1/bookings/availability')
@UseGuards(SearchAvailabilityGuard)
@ApiBearerAuth()
export class SearchAvailabilityController {
  constructor(private readonly prisma: PrismaService) {}

  @Post() @HttpCode(200)
  @ApiOperation({ operationId: 'readSearchAvailability' })
  @ApiOkResponse({ schema: { type: 'object', required: ['availableRoomIds'], properties: { availableRoomIds: { type: 'array', items: { type: 'string', format: 'uuid' } } } } })
  async read(@Body() input: SearchAvailabilityRequest): Promise<{ availableRoomIds: string[] }> {
    if (input.checkOut <= input.checkIn) throw new BadRequestException('Invalid stay period');
    // Match the half-open range and partial predicate of bookings_no_overlap, including holds under review.
    const rows = await this.prisma.$queryRaw<{ roomId: string }[]>`
      SELECT candidate AS "roomId" FROM unnest(${input.roomIds}::uuid[]) AS candidate
      WHERE NOT EXISTS (
        SELECT 1 FROM room_calendar b WHERE b.room_id = candidate
        AND daterange(b.arrival, b.departure, '[)') && daterange(${input.checkIn}::date, ${input.checkOut}::date, '[)')
      )`;
    return { availableRoomIds: rows.map(row => row.roomId) };
  }
}
