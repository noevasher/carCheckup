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
    },
  },
});
