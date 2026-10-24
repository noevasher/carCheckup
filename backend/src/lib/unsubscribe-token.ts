import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';

const sign = (userId: string): Buffer => createHmac('sha256', env.UNSUBSCRIBE_SECRET).update(`unsub:${userId}`).digest();

/** Single-purpose credential to unsubscribe from reminder emails without a session (research R10). */
export function createUnsubscribeToken(userId: string): string {
  return `${Buffer.from(userId).toString('base64url')}.${sign(userId).toString('base64url')}`;
}

/** Returns the user id of a valid token, or null (constant-time signature check). */
export function verifyUnsubscribeToken(token: string): string | null {
  const [idPart, sigPart] = token.split('.');
  if (idPart === undefined || sigPart === undefined || token.split('.').length !== 2) return null;
  const userId = Buffer.from(idPart, 'base64url').toString('utf8');
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const expected = sign(userId);
  const actual = Buffer.from(sigPart, 'base64url');
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? userId : null;
}
