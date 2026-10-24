import { randomUUID } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from 'jose';
import supertest from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetProfileCache } from '../src/modules/profile/profile.service';

const ISSUER = 'http://supabase.test/auth/v1';

export async function createTestContext() {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'ES256' };
  const app = createApp({ jwks: createLocalJWKSet({ keys: [jwk] }), rateLimit: false });

  async function tokenFor(userId: string, overrides: { issuer?: string } = {}): Promise<string> {
    return new SignJWT({ role: 'authenticated', email: `${userId}@test.dev` })
      .setProtectedHeader({ alg: 'ES256', kid: 'test' })
      .setSubject(userId)
      .setIssuer(overrides.issuer ?? ISSUER)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
  }

  async function userAgent(userId: string = randomUUID()) {
    const token = await tokenFor(userId);
    const request = supertest(app);
    const auth = { Authorization: `Bearer ${token}` };
    return {
      userId,
      get: (path: string) => request.get(path).set(auth),
      post: (path: string, body: object) => request.post(path).set(auth).send(body),
      patch: (path: string, body: object) => request.patch(path).set(auth).send(body),
      put: (path: string, body: object) => request.put(path).set(auth).send(body),
      delete: (path: string) => request.delete(path).set(auth),
    };
  }

  return { app, tokenFor, userAgent };
}

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE mileage_readings, vehicles, profiles, catalog_models, catalog_makes, payment_events, paypal_plans CASCADE',
  );
  resetProfileCache();
}

export const daysAgo = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString();
