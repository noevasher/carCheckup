import { defineConfig, devices } from '@playwright/test';
import { E2E } from './tests/e2e/support/config';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: E2E.webUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
      },
    },
  ],
  webServer: [
    {
      command: 'npx tsx tests/e2e/support/fake-auth.ts',
      url: `${E2E.authUrl}/health`,
      env: { FAKE_AUTH_PORT: String(E2E.authPort) },
      reuseExistingServer: false,
    },
    {
      command: 'npx tsx ../backend/src/server.ts',
      url: `${E2E.apiUrl}/health`,
      env: {
        NODE_ENV: 'development',
        LOG_LEVEL: 'warn',
        PORT: String(E2E.apiPort),
        DATABASE_URL: E2E.databaseUrl,
        SUPABASE_URL: E2E.authUrl,
        SUPABASE_JWKS_URL: `${E2E.authUrl}/auth/v1/.well-known/jwks.json`,
        CORS_ORIGIN: E2E.webUrl,
        UNUSUAL_KM_PER_DAY: '1500',
      },
      reuseExistingServer: false,
    },
    {
      command: `npx vite --port ${String(E2E.webPort)} --strictPort`,
      url: E2E.webUrl,
      env: {
        VITE_SUPABASE_URL: E2E.authUrl,
        VITE_SUPABASE_ANON_KEY: 'e2e-anon-key',
        VITE_API_URL: E2E.apiUrl,
      },
      reuseExistingServer: false,
    },
  ],
});
