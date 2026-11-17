import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { INVENTORY_CONFIG } from '@inventory/infrastructure/config/config.module';
import { loadInventoryConfig, type InventoryConfig } from '@inventory/infrastructure/config/inventory-config';
import { installGracefulShutdown } from '@inventory/infrastructure/lifecycle/graceful-shutdown';
import { InventoryLogger } from '@inventory/infrastructure/observability/inventory-logger';
import { startTelemetry, stopTelemetry } from '@inventory/infrastructure/observability/otel';
import { configureHttp } from '@inventory/interfaces/http/configure-http';
import { configureInventoryOpenApi } from '@inventory/interfaces/openapi/openapi.factory';

import { AppModule } from './app.module';

/**
 * Bootstrap (T030): fail-fast config, telemetry, bounded JSON body, shared HTTP setup, Swagger and an ordered close
 * on SIGTERM/SIGINT within the grace period. The complete graceful shutdown (in-flight requests) is T067.
 */
async function bootstrap(): Promise<void> {
  startTelemetry(loadInventoryConfig());
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, bodyParser: false });
  const config = app.get<InventoryConfig>(INVENTORY_CONFIG);
  app.useLogger(app.get(InventoryLogger));
  app.disable('x-powered-by');
  // 200 items x 120-char names fit comfortably; anything larger is rejected with 413 before validation.
  app.useBodyParser('json', { limit: '64kb' });
  configureHttp(app);
  configureInventoryOpenApi(app);
  installGracefulShutdown(app, {
    graceMs: config.shutdownGraceMs,
    logger: app.get(InventoryLogger),
    exit: (code) => void stopTelemetry().finally(() => process.exit(code)),
  });
  await app.listen(config.port, '0.0.0.0');
}

void bootstrap();
