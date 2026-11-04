import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { FieldError } from './validation.exception';

interface TracedRequest extends Request { traceId?: string }
interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  traceId: string;
  errors: readonly FieldError[];
}

const titles: Record<number, string> = {
  400: 'Invalid request', 401: 'Authentication required', 403: 'Access denied', 404: 'Resource not found',
  409: 'Conflict', 413: 'Payload too large', 415: 'Unsupported media type', 500: 'Internal error', 503: 'Service unavailable',
};

@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<TracedRequest>();
    const traceId = request.traceId ?? '00000000000000000000000000000000';
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const candidate = error as { problemCode?: unknown; errors?: unknown };
    const code = candidate?.problemCode === 'VALIDATION_ERROR' ? 'VALIDATION_ERROR' : `HTTP_${status}`;
    const errors = candidate?.problemCode === 'VALIDATION_ERROR' && Array.isArray(candidate.errors)
      ? candidate.errors as FieldError[]
      : [];
    const title = titles[status] ?? 'Request failed';
    const problem: Problem = {
      type: 'about:blank', title, status, detail: title,
      instance: `urn:request:${traceId}`, code, traceId, errors,
    };

    response.setHeader('x-trace-id', traceId);
    response.setHeader('Cache-Control', 'no-store');
    response.status(status).type('application/problem+json').json(problem);
  }
}
