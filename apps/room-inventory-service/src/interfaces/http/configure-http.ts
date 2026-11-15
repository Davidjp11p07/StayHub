import type { INestApplication } from '@nestjs/common';

import { InventoryMetrics } from '@inventory/infrastructure/observability/inventory-metrics';

import { ProblemDetailsFilter } from './problem.filter';
import { TraceInterceptor, traceMiddleware } from './trace.interceptor';
import { ClosedValidationPipe } from './validation.pipe';

function optionalMetrics(app: INestApplication): InventoryMetrics | undefined {
  try {
    return app.get(InventoryMetrics, { strict: false });
  } catch {
    return undefined;
  }
}

/** Shared HTTP setup for main.ts and tests: trace id, closed validation, Problem Details, duration metric. */
export function configureHttp(app: INestApplication): void {
  app.use(traceMiddleware);
  app.useGlobalPipes(new ClosedValidationPipe());
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.useGlobalInterceptors(new TraceInterceptor(optionalMetrics(app)));
}
