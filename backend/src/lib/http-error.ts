import type { ApiErrorBody, ApiErrorCode, ValidRange } from '@car-checkup/shared/errors';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    readonly extras: Omit<ApiErrorBody, 'code'> = {},
  ) {
    super(code);
    this.name = 'HttpError';
  }

  toBody(): { error: ApiErrorBody } {
    return { error: { code: this.code, ...this.extras } };
  }
}

export const notFound = (): HttpError => new HttpError(404, 'NOT_FOUND');

export const validationError = (fields: Record<string, string>): HttpError =>
  new HttpError(422, 'VALIDATION_ERROR', { fields });

export const outOfOrder = (validRange: ValidRange): HttpError =>
  new HttpError(422, 'READING_OUT_OF_ORDER', { validRange });

export const conflict = (
  code: Extract<ApiErrorCode, 'UNUSUAL_DISTANCE' | 'LAST_READING_UNDELETABLE' | 'ID_CONFLICT'>,
): HttpError => new HttpError(409, code);
