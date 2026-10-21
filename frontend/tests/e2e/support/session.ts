import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { E2E } from './config';

/** Signs in a brand-new user by storing a Supabase-format session before the app loads. */
export async function signInAsNewUser(page: Page): Promise<string> {
  const userId = randomUUID();
  const res = await fetch(`${E2E.authUrl}/test/token?sub=${userId}`);
  const { token } = (await res.json()) as { token: string };
  const now = Math.floor(Date.now() / 1000);
  const session = {
    access_token: token,
    refresh_token: 'e2e-refresh',
    token_type: 'bearer',
    expires_in: 7200,
    expires_at: now + 7200,
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: `${userId}@e2e.test`,
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
  await page.addInitScript(
    ([key, value]) => {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value);
    },
    ['sb-localhost-auth-token', JSON.stringify(session)] as const,
  );
  return userId;
}
