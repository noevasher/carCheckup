import { z } from 'zod/mini';

const EnvSchema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().check(z.minLength(1)),
  VITE_API_URL: z.url(),
});

/** Thrown when frontend/.env is missing or invalid; main.tsx renders it instead of a blank page. */
export class EnvConfigError extends Error {
  constructor(readonly variables: string[]) {
    super(`Missing or invalid environment variables: ${variables.join(', ')}`);
    this.name = 'EnvConfigError';
  }
}

function loadEnv() {
  const parsed = EnvSchema.safeParse(import.meta.env);
  if (!parsed.success) {
    throw new EnvConfigError([...new Set(parsed.error.issues.map((i) => String(i.path[0])))]);
  }
  return parsed.data;
}

export const env = loadEnv();
