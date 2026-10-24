import { z } from 'zod';
import type { PushSubscription } from '../generated/prisma/browser';
import type { AssertKeysIn } from './common';

export const PushSubscriptionCreateSchema = z.object({
  endpoint: z
    .url()
    .max(2048)
    .refine((u) => u.startsWith('https://'), { message: 'not_https' }),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
  userAgent: z.string().max(300).nullable().optional(),
});
export type PushSubscriptionCreateInput = z.infer<typeof PushSubscriptionCreateSchema>;

export const PushSubscriptionDeleteSchema = z.object({ endpoint: z.url().max(2048) });

export const UnsubscribeSchema = z.object({ token: z.string().min(1).max(200) });

export const JobQuerySchema = z.object({
  budgetMs: z.coerce.number().int().min(1000).max(3_300_000).optional(),
});

/** Resend webhook events we act on (FR-015); other event types are ignored. */
export const ResendWebhookSchema = z.object({
  type: z.string().max(100),
  data: z.looseObject({
    email_id: z.string().max(200).optional(),
    bounce: z.looseObject({ type: z.string().max(50).optional() }).optional(),
  }),
});
export type ResendWebhookEvent = z.infer<typeof ResendWebhookSchema>;

type SubscriptionFields = Pick<PushSubscriptionCreateInput, 'endpoint' | 'userAgent'>;
export const pushSubscriptionMatchesModel: AssertKeysIn<SubscriptionFields, PushSubscription> = true;
