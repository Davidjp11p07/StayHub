import { Body, ConflictException, Controller, Delete, ForbiddenException, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { IsDateString, Matches } from 'class-validator';
import { ACCOMMODATION_QUOTE_PORT, type AccommodationQuotePort } from '@bookings/application/ports/accommodation-quote.port';
import { PrismaService } from '@bookings/infrastructure/persistence/prisma/prisma.service';
import { ServiceAuthGuard, type AuthenticatedRequest } from '../guards/service-auth.guard';

export class MaintenanceDates {
  @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/u) from!: string;
  @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/u) to!: string;
}

@Controller('bookings/maintenance')
@UseGuards(ServiceAuthGuard)
export class MaintenanceController {
  constructor(private readonly db: PrismaService, @Inject(ACCOMMODATION_QUOTE_PORT) private readonly rooms: AccommodationQuotePort) {}
  private owner(request: AuthenticatedRequest) {
    if (request.principal?.role !== 'OWNER') throw new ForbiddenException();
    return request.principal.sub;
  }

  @Get(':property')
  list(@Param('property', ParseUUIDPipe) property: string, @Req() request: AuthenticatedRequest) {
    const owner = this.owner(request);
    return this.db.$queryRaw`SELECT id, room_id AS "roomId", arrival::text AS "from", departure::text AS "to"
      FROM room_calendar WHERE maintenance AND owner_id=${owner}::uuid AND property_id=${property}::uuid ORDER BY arrival`;
  }

  @Post(':property/:room')
  async block(@Param('property', ParseUUIDPipe) property: string, @Param('room', ParseUUIDPipe) room: string,
    @Body() dates: MaintenanceDates, @Req() request: AuthenticatedRequest) {
    const owner = this.owner(request);
    if (dates.to <= dates.from) throw new BadRequestException();
    const quote = await this.rooms.getQuote(property, room, 1);
    if (quote.ownerId !== owner) throw new ForbiddenException();
    const id = crypto.randomUUID();
    try {
      await this.db.$executeRaw`INSERT INTO room_calendar VALUES
        (${id}::uuid,${room}::uuid,${property}::uuid,${owner}::uuid,${dates.from}::date,${dates.to}::date,true)`;
    } catch (error) {
      if (error instanceof Error && /23P01|room_calendar_no_overlap/u.test(error.message)) throw new ConflictException();
      throw error;
    }
    return { id };
  }

  @Delete(':property/:id')
  async release(@Param('property', ParseUUIDPipe) property: string, @Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    const owner = this.owner(request);
    const count = await this.db.$executeRaw`DELETE FROM room_calendar WHERE maintenance AND id=${id}::uuid
      AND owner_id=${owner}::uuid AND property_id=${property}::uuid`;
    if (!count) throw new NotFoundException();
    return { id };
  }
}
