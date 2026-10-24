import { z } from 'zod';
import { MAX_DONATION, MIN_DONATION } from '../donations/amounts';

export const DonationStartSchema = z.object({
  kind: z.enum(['ONE_TIME', 'MONTHLY']),
  /** Whole MXN (FR-003). */
  amount: z.number().int().min(MIN_DONATION).max(MAX_DONATION),
  provider: z.enum(['STRIPE', 'PAYPAL']),
  /** Generated once per visit to the support screen; makes the start idempotent (research R4). */
  checkoutKey: z.uuid(),
});
export type DonationStartInput = z.infer<typeof DonationStartSchema>;

export const DonationIdParamsSchema = z.object({ donationId: z.uuid() });
