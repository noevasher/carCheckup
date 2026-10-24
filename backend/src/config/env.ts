import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  SUPABASE_URL: z.url(),
  SUPABASE_JWKS_URL: z.url(),
  CORS_ORIGIN: z.string().min(1),
  UNUSUAL_KM_PER_DAY: z.coerce.number().positive().default(1500),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Reminders (feature 003)
  APP_URL: z.url().default('http://localhost:5173'),
  /** Public URL of this API (one-click unsubscribe header). */
  API_URL: z.url().default('http://localhost:3000'),
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z
    .string()
    .refine((s) => s.startsWith('mailto:') || s.startsWith('https://'), { message: 'mailto: or https://' })
    .default('mailto:avisos@example.com'),
  EMAIL_PROVIDER: z.enum(['resend', 'log']).default('log'),
  EMAIL_FROM: z.string().min(3).default('Car Checkup <avisos@example.com>'),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_WEBHOOK_SECRET: z.string().min(1).optional(),
  UNSUBSCRIBE_SECRET: z.string().min(32),
  JOBS_SECRET: z.string().min(32),
}).superRefine((e, ctx) => {
  if (e.EMAIL_PROVIDER === 'resend' && (e.RESEND_API_KEY === undefined || e.RESEND_WEBHOOK_SECRET === undefined)) {
    ctx.addIssue({ code: 'custom', path: ['RESEND_API_KEY'], message: 'RESEND_API_KEY and RESEND_WEBHOOK_SECRET are required with EMAIL_PROVIDER=resend' });
  }
  if (e.NODE_ENV === 'production' && (e.VAPID_PUBLIC_KEY === undefined || e.VAPID_PRIVATE_KEY === undefined)) {
    ctx.addIssue({ code: 'custom', path: ['VAPID_PUBLIC_KEY'], message: 'VAPID keys are required in production' });
  }
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
  }
  return Object.freeze(parsed.data);
}

export const env = loadEnv();
