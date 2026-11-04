import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { READINESS_INDICATOR, type ReadinessIndicator } from './readiness-indicator';

@Controller('health')
export class HealthController {
  constructor(@Inject(READINESS_INDICATOR) private readonly readiness: ReadinessIndicator) {}

  @Get('live')
  live(): { status: string } { return { status: 'live' }; }

  @Get('ready')
  async ready(): Promise<{ status: string }> {
    if (!await this.readiness.isReady()) throw new ServiceUnavailableException();
    return { status: 'ready' };
  }
}
