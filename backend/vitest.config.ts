import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    passWithNoTests: true,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env['TEST_DATABASE_URL'] ?? 'postgresql://localhost:5432/car_checkup_test',
      SUPABASE_URL: 'http://supabase.test',
      SUPABASE_JWKS_URL: 'http://supabase.test/auth/v1/.well-known/jwks.json',
      CORS_ORIGIN: 'http://localhost:5173',
      UNUSUAL_KM_PER_DAY: '1500',
      APP_URL: 'http://app.test',
      API_URL: 'http://api.test',
      EMAIL_PROVIDER: 'log',
      EMAIL_FROM: 'Car Checkup <avisos@example.com>',
      RESEND_WEBHOOK_SECRET: 'whsec_dGVzdC13ZWJob29rLXNlY3JldC0wMTIzNDU2Nzg5',
      UNSUBSCRIBE_SECRET: 'test-unsubscribe-secret-0123456789abcdef',
      JOBS_SECRET: 'test-jobs-secret-0123456789abcdef0123',
      PAYMENTS_PROVIDER_MODE: 'fake',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_stripe_0123456789abcdef',
      SUPPORT_EMAIL: 'soporte@test.dev',
    },
  },
});
