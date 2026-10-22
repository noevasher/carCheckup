import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Migrations use DIRECT_URL (Supabase session pooler or direct connection); the runtime client uses
// DATABASE_URL (transaction pooler) via the pg driver adapter in src/lib/prisma.ts (research R4).
// `prisma generate` needs no database, so DIRECT_URL is optional here (e.g. the Vercel build).
const directUrl = process.env['DIRECT_URL'];

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed/seed.ts',
  },
  ...(directUrl !== undefined && directUrl !== '' && { datasource: { url: directUrl } }),
});
