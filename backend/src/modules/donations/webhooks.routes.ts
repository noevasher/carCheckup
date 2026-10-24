import type { PaymentProvider } from '@car-checkup/shared/prisma/enums';
import express, { Router, type Request } from 'express';
import { env } from '../../config/env';
import { HttpError } from '../../lib/http-error';
import {
  getGateway,
  type PaymentGateway,
  type WebhookBatch,
  type WebhookHeaders,
  WebhookSignatureError,
} from '../../lib/payments';
import { logger } from '../../middleware/logging';
import { applyPaymentEvent } from './apply-event';
import { sendDonationThanks } from './thanks-email';

function headersOf(req: Request): WebhookHeaders {
  const out: WebhookHeaders = {};
  for (const [key, value] of Object.entries(req.headers))
    out[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
  return out;
}

/** Applies a verified batch and runs the after-commit effects (capture, thank-you emails). */
export async function processWebhookBatch(
  gateway: PaymentGateway,
  batch: WebhookBatch,
): Promise<void> {
  const result = await applyPaymentEvent(gateway.name, batch);
  if (result.duplicate) return;
  for (const event of batch.events) {
    if (event.type !== 'one_time_approved') continue;
    // PayPal: capture an approved order the user did not come back to (never confirms by itself).
    await gateway.captureOrder(event.checkoutId).catch((err: unknown) => {
      logger.warn({ err, orderId: event.checkoutId }, 'capture after approval failed');
    });
  }
  for (const id of result.confirmedDonationIds) await sendDonationThanks(id);
}

async function handle(gateway: PaymentGateway | null, req: Request): Promise<void> {
  const raw: unknown = req.body;
  if (gateway === null || !Buffer.isBuffer(raw)) throw new HttpError(400, 'VALIDATION_ERROR');
  let batch: WebhookBatch;
  try {
    batch = await gateway.verifyAndParseWebhook(raw, headersOf(req));
  } catch (err) {
    // Signature first: an unverified body is never read (contracts/payments.md).
    if (err instanceof WebhookSignatureError)
      throw new HttpError(400, 'VALIDATION_ERROR', { fields: { signature: 'invalid' } });
    throw err;
  }
  await processWebhookBatch(gateway, batch);
}

/** Stripe and PayPal webhooks (raw body for signatures; mounted before the JSON parser). */
export const donationWebhooksRouter = Router();
const raw = express.raw({ type: '*/*', limit: '256kb' });

for (const [path, provider] of [
  ['/webhooks/stripe', 'STRIPE'],
  ['/webhooks/paypal', 'PAYPAL'],
] as const satisfies readonly (readonly [string, PaymentProvider])[]) {
  donationWebhooksRouter.post(path, raw, async (req, res) => {
    await handle(getGateway(provider), req);
    res.status(200).json({ received: true });
  });
}

// Simulated provider (development, tests, e2e). Never mounted with real payments (research R13).
if (env.PAYMENTS_PROVIDER_MODE === 'fake') {
  donationWebhooksRouter.post('/webhooks/fake/:provider', raw, async (req, res) => {
    const provider = req.params['provider'] === 'paypal' ? 'PAYPAL' : 'STRIPE';
    await handle(getGateway(provider), req);
    res.status(200).json({ received: true });
  });
}
