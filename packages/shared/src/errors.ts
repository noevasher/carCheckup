export const API_ERROR_CODES = [
  'UNAUTHORIZED',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'READING_OUT_OF_ORDER',
  'UNUSUAL_DISTANCE',
  'LAST_READING_UNDELETABLE',
  'ID_CONFLICT',
  'RATE_LIMITED',
  'INTERNAL',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ValidRange {
  minKm: number;
  maxKm: number | null;
}

export interface ApiErrorBody {
  code: ApiErrorCode;
  /** Field path → validation code. User-facing text is produced by the UI. */
  fields?: Record<string, string>;
  /** Present on READING_OUT_OF_ORDER. */
  validRange?: ValidRange;
}

export interface ApiError {
  error: ApiErrorBody;
}

export function isApiError(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const { error } = value;
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    (API_ERROR_CODES as readonly string[]).includes(error.code)
  );
}
