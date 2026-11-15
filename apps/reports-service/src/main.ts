import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { ReportsModule } from './app';
import { ReportsErrorFilter } from './interfaces/http';
import { createDocument } from './openapi';
async function bootstrap(): Promise<void> { const app = await NestFactory.create(ReportsModule, { logger: ['error', 'warn'] }); app.useGlobalFilters(new ReportsErrorFilter()); app.enableShutdownHooks(); if (process.env.NODE_ENV === 'development')
    SwaggerModule.setup('docs', app, createDocument(app)); await app.listen(3011, '0.0.0.0'); }
void bootstrap().catch(() => { console.error('Reports startup failed; verify configuration and dependencies.'); process.exitCode = 1; });
