import { Catch, HttpException, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';

import { InventoryError, type InventoryErrorCode } from '@inventory/domain/inventory-errors';
import { InventoryMetrics } from '@inventory/infrastructure/observability/inventory-metrics';

/** Contract status codes (openapi-room-inventory.yaml). */
export const STATUS_BY_CODE: Readonly<Record<InventoryErrorCode, number>> = {
  VALIDATION_ERROR: 400,
  UNKNOWN_ITEM: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  ROOM_NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  INVENTORY_LIMIT_EXCEEDED: 422,
  DEPENDENCY_UNAVAILABLE: 503,
};

const TITLES: Readonly<Record<number, string>> = {
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 409: 'Conflict',
  413: 'Payload Too Large', 415: 'Unsupported Media Type', 422: 'Unprocessable Entity', 500: 'Internal Server Error', 503: 'Service Unavailable',
};

export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly traceId: string;
  readonly instance: string;
  readonly errors?: ReadonlyArray<{ readonly field: string }>;
}

function payloadTooLarge(exception: unknown): boolean {
  if (!exception || typeof exception !== 'object') return false;
  const value = exception as { type?: unknown; status?: unknown; statusCode?: unknown };
  return value.type === 'entity.too.large' || value.status === 413 || value.statusCode === 413;
}

function httpCode(exception: HttpException, status: number): string {
  const body = exception.getResponse();
  const code = body && typeof body === 'object' ? (body as { code?: unknown }).code : undefined;
  return typeof code === 'string' && /^[A-Z_]{3,64}$/u.test(code) ? code : `HTTP_${status}`;
}

/** RFC 7807 Problem Details. Never echoes request values, item names, stack traces or upstream messages. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  public constructor(private readonly metrics?: InventoryMetrics) {}

  public catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request & { traceId?: string }>();
    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let field: string | undefined;
    if (exception instanceof InventoryError) {
      status = STATUS_BY_CODE[exception.code];
      code = exception.code;
      field = exception.field;
      if (exception.code === 'VERSION_CONFLICT') this.metrics?.conflict('replace');
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = httpCode(exception, status);
    } else if (payloadTooLarge(exception)) {
      status = HttpStatus.PAYLOAD_TOO_LARGE;
      code = 'PAYLOAD_TOO_LARGE';
    }
    const problem: ProblemDetails = {
      type: `https://stayhub.dev/problems/${code.toLowerCase().replace(/_/gu, '-')}`,
      title: TITLES[status] ?? 'Error',
      status,
      code,
      traceId: request.traceId ?? 'unknown',
      instance: (request.originalUrl ?? request.url ?? '/').split('?')[0] ?? '/',
      ...(field ? { errors: [{ field }] } : {}),
    };
    if (status === 401) response.setHeader('WWW-Authenticate', 'Bearer');
    response.status(status).type('application/problem+json').json(problem);
  }
}
