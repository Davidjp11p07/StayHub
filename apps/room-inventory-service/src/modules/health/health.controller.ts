import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';

import { AccommodationsRoomContextClient, type DependencyHealth } from '@inventory/infrastructure/http/accommodations-room-context.client';
import { PrismaService } from '@inventory/infrastructure/persistence/prisma/prisma.service';

export interface ReadinessView {
  readonly status: 'ready' | 'degraded' | 'not_ready';
  readonly database: 'up' | 'down';
  readonly accommodations: DependencyHealth;
}

/**
 * `/health/live`: process alive. `/health/ready`: configuration (validated at boot), migrated schema and PostgreSQL
 * are mandatory (503 otherwise). Accommodations down only degrades readiness; requests then fail with 503 instead of
 * serving unverified data. No identifiers, URLs or error messages are exposed.
 */
@ApiExcludeController()
@Controller('health')
export class HealthController {
  public constructor(private readonly prisma: PrismaService, private readonly accommodations: AccommodationsRoomContextClient) {}

  @Get('live')
  public live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  public async ready(@Res({ passthrough: true }) response: Response): Promise<ReadinessView> {
    const database = (await this.prisma.isReady()) ? 'up' : 'down';
    const accommodations = this.accommodations.health();
    const status = database === 'down' ? 'not_ready' : accommodations === 'down' ? 'degraded' : 'ready';
    if (status === 'not_ready') response.status(HttpStatus.SERVICE_UNAVAILABLE);
    return { status, database, accommodations };
  }
}
