import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadAccommodationsConfig } from './infrastructure/config/accommodations-config';
import { configureHttp } from './interfaces/http/configure-http';

async function bootstrap(): Promise<void> {
  const config = loadAccommodationsConfig();
  const app = await NestFactory.create(AppModule);
  configureHttp(app);
  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
}

void bootstrap().catch(() => {
  process.stderr.write(`${JSON.stringify({ level: 'fatal', service: 'accommodations-service', message: 'startup failed; verify service configuration' })}\n`);
  process.exitCode = 1;
});
