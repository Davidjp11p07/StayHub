import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { BookingsClient, type BookingsRequestContext } from '@gateway/infrastructure/http/bookings.client';
import { traceIdFromRequest } from '@gateway/interfaces/http/trace-id';
import { principalFrom } from '@gateway/modules/auth/access.guard';
import { Roles } from '@gateway/modules/auth/roles.guard';
import { BookingsRateLimitGuard } from '@gateway/modules/rate-limit/bookings-rate-limit.guard';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { CreateBookingDto } from './dto/create-booking.dto';

@ApiTags('bookings')
@ApiBearerAuth()
@ApiResponse({
  status: 429,
  description: 'Per-user Bookings quota exceeded.',
  headers: { 'Retry-After': { description: 'Seconds until the current quota window expires.', schema: { type: 'integer', minimum: 1 } } },
})
@Controller('bookings')
@UseGuards(BookingsRateLimitGuard)
export class BookingsController {
  public constructor(private readonly bookings: BookingsClient) {}

  @Get() @Roles('GUEST')
  public guestList(@Req() request: Request): Promise<unknown> {
    return this.bookings.request(context(request), 'GET', `/bookings${allowedQuery(request, ['from', 'to', 'status', 'page', 'pageSize'])}`);
  }

  @Post('quote') @HttpCode(200) @Roles('GUEST')
  public preview(@Body() body: CreateBookingDto, @Req() request: Request): Promise<unknown> {
    return this.bookings.request(context(request), 'POST', '/bookings/quote', body);
  }

  @Post() @Roles('GUEST')
  public create(@Body() body: CreateBookingDto, @Headers('idempotency-key') key: string | undefined, @Req() request: Request): Promise<unknown> {
    if (!key || !/^[A-Za-z0-9._:-]{16,128}$/u.test(key)) throw new BadRequestException({ code: 'INVALID_IDEMPOTENCY_KEY' });
    return this.bookings.request(context(request), 'POST', '/bookings', body, key);
  }

  @Get('calendar/:property/:room/:month') @Roles('GUEST')
  calendar(@Param('property') property: string, @Param('room') room: string, @Param('month') month: string, @Req() request: Request) {
    if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/u.test(month)) throw new BadRequestException();
    return this.bookings.request(context(request), 'GET', '/bookings/calendar/'+uuid(property)+'/'+uuid(room)+'/'+month);
  }

  @Get('history') @Roles('OWNER')
  public history(@Req() request: Request): Promise<unknown> {
    return this.bookings.request(context(request), 'GET', `/bookings/history${allowedQuery(request, ['from', 'to', 'status', 'guestId', 'propertyId', 'page', 'pageSize'])}`);
  }

  @Get('maintenance/:property') @Roles('OWNER')
  maintenance(@Param('property') property: string, @Req() request: Request) {
    return this.bookings.request(context(request), 'GET', '/bookings/maintenance/' + uuid(property));
  }

  @Post('maintenance/:property/:room') @Roles('OWNER')
  block(@Param('property') property: string, @Param('room') room: string, @Body() dates: { from: string; to: string }, @Req() request: Request) {
    return this.bookings.request(context(request), 'POST', '/bookings/maintenance/' + uuid(property) + '/' + uuid(room), dates);
  }

  @Delete('maintenance/:property/:id') @Roles('OWNER')
  release(@Param('property') property: string, @Param('id') id: string, @Req() request: Request) {
    return this.bookings.request(context(request), 'DELETE', '/bookings/maintenance/' + uuid(property) + '/' + uuid(id));
  }

  @Get(':bookingId/messages') @Roles('GUEST','OWNER')
  messages(@Param('bookingId') id:string,@Req() request:Request) {
    return this.bookings.request(context(request),'GET','/bookings/'+uuid(id)+'/messages');
  }

  @Post(':bookingId/messages') @Roles('GUEST','OWNER')
  sendMessage(@Param('bookingId') id:string,@Body() message:{id:string;body:string},@Req() request:Request) {
    return this.bookings.request(context(request),'POST','/bookings/'+uuid(id)+'/messages',message);
  }

  @Get(':bookingId/cancellation-preview') @Roles('GUEST', 'OWNER')
  public cancellationPreview(@Param('bookingId') bookingId: string, @Req() request: Request): Promise<unknown> {
    return this.bookings.request(context(request), 'GET', `/bookings/${uuid(bookingId)}/cancellation-preview`);
  }

  @Get(':bookingId')
  public get(@Param('bookingId') bookingId: string, @Req() request: Request): Promise<unknown> {
    return this.bookings.request(context(request), 'GET', `/bookings/${uuid(bookingId)}`);
  }

  @Delete(':bookingId')
  public remove(@Param('bookingId') bookingId: string, @Body() body: CancelBookingDto, @Req() request: Request): Promise<unknown> {
    return this.bookings.request(context(request), 'DELETE', `/bookings/${uuid(bookingId)}`, body);
  }

  @Post(':bookingId/check-in') @HttpCode(200) @Roles('OWNER')
  public checkIn(@Param('bookingId') bookingId: string, @Req() request: Request): Promise<unknown> {
    return this.bookings.request(context(request), 'POST', `/bookings/${uuid(bookingId)}/check-in`);
  }

  @Post(':bookingId/check-out') @HttpCode(200) @Roles('OWNER')
  public checkOut(@Param('bookingId') bookingId: string, @Req() request: Request): Promise<unknown> {
    return this.bookings.request(context(request), 'POST', `/bookings/${uuid(bookingId)}/check-out`);
  }
}

function context(request: Request): BookingsRequestContext {
  const principal = principalFrom(request);
  if (!principal) throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED' });
  return { traceId: traceIdFromRequest(request), userId: principal.userId, role: principal.role };
}

function uuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) throw new BadRequestException({ code: 'INVALID_BOOKING_ID' });
  return encodeURIComponent(value);
}

function allowedQuery(request: Request, names: readonly string[]): string {
  if (Object.keys(request.query).some((key) => !names.includes(key))) throw new BadRequestException({ code: 'UNKNOWN_QUERY_PARAMETER' });
  const params = new URLSearchParams();
  for (const name of names) {
    const value = request.query[name];
    if (typeof value === 'string') params.set(name, value);
    else if (value !== undefined) throw new BadRequestException({ code: 'INVALID_QUERY_PARAMETER' });
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}
