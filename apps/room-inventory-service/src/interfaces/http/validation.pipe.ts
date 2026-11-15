import { Injectable, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

import { InventoryError } from '@inventory/domain/inventory-errors';

/** First failing property, including nested paths such as `items.3.name`. */
function firstField(errors: readonly ValidationError[], prefix = ''): string | undefined {
  const error = errors[0];
  if (!error) return undefined;
  const path = prefix ? `${prefix}.${error.property}` : error.property;
  return error.children?.length ? firstField(error.children, path) ?? path : path;
}

/** Closed DTOs: unknown fields are rejected (`whitelist` + `forbidNonWhitelisted`) with a 400 Problem Details. */
@Injectable()
export class ClosedValidationPipe extends ValidationPipe {
  public constructor() {
    super({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      exceptionFactory: (errors: ValidationError[]) => new InventoryError('VALIDATION_ERROR', firstField(errors)),
    });
  }
}
