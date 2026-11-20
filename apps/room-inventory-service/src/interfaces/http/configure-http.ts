import type { INestApplication } from '@nestjs/common';

import { InventoryLogger } from '@inventory/infrastructure/observability/inventory-logger';
import { InventoryMetrics } from '@inventory/infrastructure/observability/inventory-metrics';

import { ProblemDetailsFilter } from './problem.filter';
import { TraceInterceptor, traceMiddleware } from './trace.interceptor';
import { ClosedValidationPipe } from './validation.pipe';

function optional<T>(app: INestApplication, token: new () => T): T | undefined {
  try {
    return app.get(token, { strict: false });
  } catch {
    return undefined;
  }
}

/** Shared HTTP setup for main.ts and tests: trace id, closed validation, Problem Details, duration metric and logs. */
export function configureHttp(app: INestApplication): void {
  app.use(traceMiddleware);
  app.useGlobalPipes(new ClosedValidationPipe());
  app.useGlobalFilters(new ProblemDetailsFilter(optional(app, InventoryMetrics)));
  app.useGlobalInterceptors(new TraceInterceptor(optional(app, InventoryMetrics), optional(app, InventoryLogger)));
}
