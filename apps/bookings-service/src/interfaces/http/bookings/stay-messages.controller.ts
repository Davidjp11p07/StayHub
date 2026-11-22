import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { IsUUID, IsString, Length, Matches } from 'class-validator';
import { GetBookingUseCase } from '@bookings/application/get-booking/get-booking.use-case';
import { PrismaService } from '@bookings/infrastructure/persistence/prisma/prisma.service';
import { ServiceAuthGuard, type AuthenticatedRequest } from '../guards/service-auth.guard';

class StayMessageDto {
  @IsUUID() id!: string;
  @IsString() @Length(1,2000) @Matches(/\S/u) body!: string;
}

@Controller('bookings/:bookingId/messages')
@UseGuards(ServiceAuthGuard)
export class StayMessagesController {
  constructor(private readonly access: GetBookingUseCase, private readonly db: PrismaService) {}
  private async participant(bookingId: string, request: AuthenticatedRequest): Promise<'GUEST' | 'OWNER'> {
    const {viewer} = await this.access.execute({bookingId, actorRole: request.principal?.role ?? '', actorId: request.principal?.sub ?? ''});
    return viewer.role;
  }
  @Get()
  async list(@Param('bookingId',ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest): Promise<{ id: string; role: 'GUEST' | 'OWNER'; body: string; sentAt: Date }[]> {
    await this.participant(id,request);
    return this.db.$queryRaw`SELECT id, sender_role AS role, body, sent_at AS "sentAt"
      FROM stay_messages WHERE booking_id=${id}::uuid ORDER BY sent_at,id`;
  }
  @Post()
  async send(@Param('bookingId',ParseUUIDPipe) id: string, @Body() message: StayMessageDto, @Req() request: AuthenticatedRequest): Promise<{ id: string }> {
    const role = await this.participant(id,request);
    await this.db.$executeRaw`INSERT INTO stay_messages(id,booking_id,sender_role,body)
      VALUES (${message.id}::uuid,${id}::uuid,${role},${message.body.trim()}) ON CONFLICT (id) DO NOTHING`;
    return {id:message.id};
  }
}
