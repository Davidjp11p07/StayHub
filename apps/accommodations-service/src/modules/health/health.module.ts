import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { READINESS_INDICATOR, type ReadinessIndicator } from './readiness-indicator';

const localReadiness: ReadinessIndicator = { isReady: () => Promise.resolve(true) };

@Module({
  controllers: [HealthController],
  providers: [{ provide: READINESS_INDICATOR, useValue: localReadiness }],
})
export class HealthModule {}
