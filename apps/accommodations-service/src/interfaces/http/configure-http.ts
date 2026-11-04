import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ProblemFilter } from './problem.filter';
import { ValidationException } from './validation.exception';

interface TracedRequest extends Request { traceId?: string }

function traceMiddleware(req: TracedRequest, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-trace-id'];
  req.traceId = typeof incoming === 'string' && /^[0-9a-f]{32}$/.test(incoming) && !/^0+$/.test(incoming)
    ? incoming
    : randomBytes(16).toString('hex');
  res.setHeader('x-trace-id', req.traceId);
  res.setHeader('Cache-Control', 'no-store');
  next();
}

export function configureHttp(app: INestApplication): void {
  app.use(traceMiddleware);
  app.useGlobalFilters(new ProblemFilter());
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: (errors): ValidationException => new ValidationException(errors),
  }));
}
