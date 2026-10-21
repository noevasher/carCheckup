import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { HttpError } from '../lib/http-error';

const limitReached = (): never => {
  throw new HttpError(429, 'RATE_LIMITED');
};

/** Coarse per-IP limit applied before authentication. */
export const ipRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: limitReached,
});

/** Per-user limit applied after authentication. */
export const userRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.userId ?? ipKeyGenerator(req.ip ?? ''),
  handler: limitReached,
});
