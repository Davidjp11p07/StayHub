import { Controller, Get, Header, HttpException, Param, ParseUUIDPipe, Patch, Query, Req, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { principalFrom } from '../auth/access.guard';

@Controller('notifications')
export class GuestNotificationsController {
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() request: Request, @Query('cursor') cursor?: string): Promise<unknown> {
    const principal = principalFrom(request);
    if (!principal) throw new UnauthorizedException();
    const query = new URLSearchParams({ limit: '20' });
    if (cursor) query.set('cursor', cursor);
    return this.forward(request, 'GET', '/user/' + encodeURIComponent(principal.userId) + '?' + query.toString());
  }

  @Patch(':id/read')
  read(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    return this.forward(request, 'PATCH', '/' + id + '/read');
  }

  private async forward(request: Request, method: string, path: string): Promise<unknown> {
    const base = process.env.GATEWAY_NOTIFICATIONS_BASE_URL || 'http://notifications-service:3009';
    try {
      const response = await fetch(base + '/notifications' + path, {
        method, headers: { authorization: request.headers.authorization ?? '' }, signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) throw new HttpException('No se pudo consultar la notificación', response.status);
      return await response.json() as unknown;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException();
    }
  }
}
