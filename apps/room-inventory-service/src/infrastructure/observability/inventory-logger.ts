import { Inject, Injectable, Optional, type LoggerService } from '@nestjs/common';
import { trace } from '@opentelemetry/api';

import { INVENTORY_CONFIG } from '@inventory/infrastructure/config/config.module';
import type { InventoryConfig, InventoryLogLevel } from '@inventory/infrastructure/config/inventory-config';

/** Keys whose values are never logged: credentials, bodies and item names (owner-entered free text). */
const SENSITIVE_KEY = /authorization|token|jwt|password|secret|cookie|privatekey|body|payload|items|^name$|email|phone/iu;
const BEARER = /Bearer\s+[A-Za-z0-9._-]+/gu;
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/gu;
const CREDENTIAL_URL = /([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/giu;
const PEM = /-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/gu;
const ORDER: Readonly<Record<InventoryLogLevel, number>> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Removes secrets and free text from any log value, recursively. */
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    return value.replace(PEM, '[REDACTED_PEM]').replace(BEARER, 'Bearer [REDACTED]').replace(JWT, '[REDACTED_JWT]').replace(CREDENTIAL_URL, '$1[REDACTED]@');
  }
  if (!value || typeof value !== 'object' || depth > 5) return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(item, depth + 1)]));
}

/** JSON lines logger with redaction and a configurable minimum level. */
@Injectable()
export class InventoryLogger implements LoggerService {
  private readonly minimum: number;

  public constructor(@Optional() @Inject(INVENTORY_CONFIG) config?: InventoryConfig) {
    this.minimum = ORDER[config?.logLevel ?? 'info'];
  }

  public log(message: unknown, context?: string): void { this.write('info', message, context); }

  /** Request-scoped log with an explicit trace id (the span may already be closed when finalizers run). */
  public logRequest(message: Record<string, unknown>, traceId: string, context?: string): void {
    this.write('info', message, context, undefined, traceId);
  }
  public warn(message: unknown, context?: string): void { this.write('warn', message, context); }
  public debug(message: unknown, context?: string): void { this.write('debug', message, context); }
  public error(message: unknown, stack?: string, context?: string): void { this.write('error', message, context, stack); }

  private write(level: InventoryLogLevel, message: unknown, context?: string, stack?: string, explicitTraceId?: string): void {
    if (ORDER[level] < this.minimum) return;
    const span = trace.getActiveSpan();
    const line = {
      timestamp: new Date().toISOString(),
      level,
      service: 'room-inventory-service',
      ...(context ? { context } : {}),
      message: redact(message),
      ...(span ? { traceId: span.spanContext().traceId } : explicitTraceId ? { traceId: explicitTraceId } : {}),
      ...(stack ? { errorTrace: '[REDACTED]' } : {}),
    };
    process.stdout.write(`${JSON.stringify(line)}\n`);
  }
}
