import { ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { Controller, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { NOTIFICATION_REPOSITORY } from '../../../application/ports/notification.repository';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/jwt.verifier';
import { AccessJwtGuard } from '../guards/access-jwt.guard';

@Controller('notifications')
export class ReadNotificationController {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly notifications: { markRead(id: string, userId: string): Promise<Date | undefined> }) {}

  @Patch(':notificationId/read')
  @ApiOperation({ operationId: 'markNotificationRead' })
  @ApiBearerAuth('accessJwt')
  @ApiParam({ name: 'notificationId', type: String, format: 'uuid' })
  @UseGuards(AccessJwtGuard)
  async read(@Param('notificationId', ParseUUIDPipe) id: string, @Req() request: Request & { user: AuthenticatedPrincipal }): Promise<{ readAt: Date }> {
    const readAt = await this.notifications.markRead(id, request.user.sub);
    if (!readAt) throw new NotFoundException();
    return { readAt };
  }
}
