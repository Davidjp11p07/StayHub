import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

export interface FieldError { field: string; code: string }

export class ValidationException extends BadRequestException {
  readonly problemCode = 'VALIDATION_ERROR';
  readonly errors: readonly FieldError[];

  constructor(errors: ValidationError[]) {
    super('Request validation failed');
    this.errors = errors.map((error) => ({ field: error.property || 'body', code: 'INVALID_VALUE' }));
  }
}
