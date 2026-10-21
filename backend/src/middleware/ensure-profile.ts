import type { NextFunction, Request, Response } from 'express';
import { ensureProfile } from '../modules/profile/profile.service';
import { requireUserId } from './auth';

export async function ensureProfileMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  await ensureProfile(requireUserId(req));
  next();
}
