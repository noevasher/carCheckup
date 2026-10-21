import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import { env } from '../config/env';
import { HttpError } from '../lib/http-error';

const unauthorized = (): HttpError => new HttpError(401, 'UNAUTHORIZED');

const Subject = z.uuid();

/**
 * Verifies the Supabase access token locally against the project's JWKS (research R2).
 * `getKey` is injectable so tests can sign tokens with a local key pair.
 */
export function authMiddleware(
  getKey: JWTVerifyGetKey = createRemoteJWKSet(new URL(env.SUPABASE_JWKS_URL)),
) {
  const issuer = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`;

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const header = req.get('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    if (token === '') throw unauthorized();

    try {
      const { payload } = await jwtVerify(token, getKey, { issuer, audience: 'authenticated' });
      const sub = Subject.safeParse(payload.sub);
      if (!sub.success) throw unauthorized();
      req.userId = sub.data;
    } catch {
      throw unauthorized();
    }
    next();
  };
}

/** Returns the authenticated user id; only valid behind authMiddleware. */
export function requireUserId(req: Request): string {
  if (req.userId === undefined) throw unauthorized();
  return req.userId;
}
