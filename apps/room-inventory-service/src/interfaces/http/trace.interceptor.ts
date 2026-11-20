import { randomUUID } from 'node:crypto';

import { Injectable, Optional, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { SpanStatusCode, trace, type Span } from '@opentelemetry/api';
import type { Request, Response } from 'express';
import { catchError, finalize, type Observable } from 'rxjs';

import { InventoryLogger } from '@inventory/infrastructure/observability/inventory-logger';
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

interface RequestContext extends TracedRequest {
  readonly principal?: { readonly role?: string };
}

/**
 * Records HTTP duration per route and opens a manual span. Attributes may include method, route, role, roomId and
 * status; they never include tokens, bodies, item names or free text.
 */
@Injectable()
export class TraceInterceptor implements NestInterceptor {
  public constructor(
    @Optional() private readonly metrics?: InventoryMetrics,
    @Optional() private readonly logger?: InventoryLogger,
  ) {}

  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestContext>();
    const response = http.getResponse<Response>();
    if (!request.traceId) {
      request.traceId = resolveTraceId(request);
      response.setHeader('x-request-id', request.traceId);
    }
    const started = process.hrtime.bigint();
    const route = `${context.getClass().name}.${context.getHandler().name}`;
    const role = request.principal?.role;
    const roomId = (request.params as { readonly roomId?: string } | undefined)?.roomId;
    const attributes = {
      'http.method': request.method,
      'http.route': route,
      ...(role ? { 'stayhub.role': role } : {}),
      ...(roomId ? { 'stayhub.room_id': roomId } : {}),
    };
    return trace.getTracer('stayhub-room-inventory-service').startActiveSpan(`HTTP ${request.method} ${route}`, { attributes }, (span: Span) =>
      next.handle().pipe(
        catchError((error: unknown) => {
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        }),
        finalize(() => {
          const seconds = Number(process.hrtime.bigint() - started) / 1e9;
          span.setAttribute('http.status_code', response.statusCode);
          span.end();
          this.metrics?.httpDuration(seconds, { route, status: response.statusCode });
          this.logger?.logRequest({
            event: 'http.request',
            route,
            method: request.method,
            status: response.statusCode,
            durationMs: Math.round(seconds * 1000),
            ...(role ? { role } : {}),
            ...(roomId ? { roomId } : {}),
          }, request.traceId ?? 'unknown', 'Http');
        }),
      ),
    );
  }
}
