import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Migrations use the direct connection; the runtime client uses DATABASE_URL (pooler) via the
// pg driver adapter in src/lib/prisma.ts (research R4).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed/seed.ts',
  },
  datasource: {
    url: env('DIRECT_URL'),
  },
});
