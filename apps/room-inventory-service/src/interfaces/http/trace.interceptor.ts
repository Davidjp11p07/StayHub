import { randomUUID } from 'node:crypto';

import { Injectable, Optional, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { finalize, type Observable } from 'rxjs';

import { InventoryMetrics } from '@inventory/infrastructure/observability/inventory-metrics';

const TRACE_ID = /^[A-Za-z0-9._:-]{8,128}$/u;

export type TracedRequest = Request & { traceId?: string };

/** Accepts a well-formed `x-request-id`/`x-trace-id` from the Gateway or creates one. */
export function resolveTraceId(request: Request): string {
  for (const name of ['x-request-id', 'x-trace-id']) {
    const value = request.header(name);
    if (value && TRACE_ID.test(value)) return value;
  }
  return randomUUID();
}

/** Express middleware: runs before guards so even 401/403 Problem Details carry the trace id. */
export function traceMiddleware(request: TracedRequest, response: Response, next: () => void): void {
  request.traceId = resolveTraceId(request);
  response.setHeader('x-request-id', request.traceId);
  next();
}

export function traceIdOf(request: TracedRequest): string {
  return request.traceId ?? resolveTraceId(request);
}

/** Records HTTP duration per route (no ids, bodies or item names in attributes). */
@Injectable()
export class TraceInterceptor implements NestInterceptor {
  public constructor(@Optional() private readonly metrics?: InventoryMetrics) {}

  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<TracedRequest>();
    const response = http.getResponse<Response>();
    if (!request.traceId) {
      request.traceId = resolveTraceId(request);
      response.setHeader('x-request-id', request.traceId);
    }
    const started = process.hrtime.bigint();
    const route = `${context.getClass().name}.${context.getHandler().name}`;
    return next.handle().pipe(finalize(() => {
      this.metrics?.httpDuration(Number(process.hrtime.bigint() - started) / 1e9, { route, status: response.statusCode });
    }));
  }
}
