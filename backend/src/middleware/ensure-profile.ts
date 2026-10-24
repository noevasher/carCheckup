import type { NextFunction, Request, Response } from 'express';
import { ensureProfile } from '../modules/profile/profile.service';
import { requireUserId } from './auth';

/**
 * Creates the profile on first use and keeps its email and time zone up to date
 * (features 003: research R6, R9). Must run after the auth and timezone middlewares.
 */
export async function ensureProfileMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  await ensureProfile(requireUserId(req), {
    email: req.userEmail ?? null,
    timeZone: req.timeZoneFromHeader === true ? (req.timeZone ?? null) : null,
  });
  next();
}
