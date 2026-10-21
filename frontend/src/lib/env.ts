import { z } from 'zod/mini';

const EnvSchema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().check(z.minLength(1)),
  VITE_API_URL: z.url(),
});

export const env = EnvSchema.parse(import.meta.env);
