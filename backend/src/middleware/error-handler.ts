import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/http-error';

const isPrismaNotFound = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2025';

const isBodyParseError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && 'type' in err && err.type === 'entity.parse.failed';

export function notFoundHandler(): never {
  throw new HttpError(404, 'NOT_FOUND');
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let httpError: HttpError;
  if (err instanceof HttpError) {
    httpError = err;
  } else if (isPrismaNotFound(err)) {
    httpError = new HttpError(404, 'NOT_FOUND');
  } else if (isBodyParseError(err)) {
    httpError = new HttpError(422, 'VALIDATION_ERROR', { fields: { _: 'invalid_json' } });
  } else {
    req.log.error({ err }, 'unhandled error');
    httpError = new HttpError(500, 'INTERNAL');
  }
  res.locals['errorCode'] = httpError.code;
  res.status(httpError.status).json(httpError.toBody());
}
