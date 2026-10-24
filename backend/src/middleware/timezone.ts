import type { NextFunction, Request, Response } from 'express';
import { isValidTimeZone } from '@car-checkup/shared/maintenance';
import { type Clock, clockFor } from '../lib/clock';

const MAX_LENGTH = 64;

/**
 * Reads the user's IANA time zone from `X-Timezone` (sent by the PWA) so "today" matches the
 * user's calendar; falls back to UTC when missing or invalid (research R7).
 */
export function timezoneMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = req.get('x-timezone');
  const valid = header !== undefined && header.length <= MAX_LENGTH && isValidTimeZone(header);
  req.timeZone = valid ? header : 'UTC';
  req.timeZoneFromHeader = valid;
  next();
}

export const requestClock = (req: Request): Clock => clockFor(req.timeZone ?? 'UTC');
