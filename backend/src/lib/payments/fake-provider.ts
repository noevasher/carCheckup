import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PaymentProvider as ProviderName } from '@car-checkup/shared/prisma/enums';
import { z } from 'zod';
import { env } from '../../config/env';
import {
  addOneMonth,
  type CheckoutRequest,
  type CheckoutResult,
  type NormalizedEvent,
  type PaymentGateway,
  ProviderUnavailableError,
  type WebhookBatch,
  type WebhookHeaders,
  WebhookSignatureError,
} from './payment-provider';

export const FAKE_SIGNATURE_HEADER = 'x-fake-signature';

const FakeWebhookSchema = z.object({
  provider: z.enum(['STRIPE', 'PAYPAL']),
  id: z.string().min(1).max(255),
  outcome: z.enum(['paid', 'canceled', 'failed']),
  kind: z.enum(['ONE_TIME', 'MONTHLY']),
  /** Donation or DonationSubscription id. */
  target: z.uuid(),
  checkoutId: z.string().min(1).max(255),
});
export type FakeWebhook = z.infer<typeof FakeWebhookSchema>;

export function signFakeWebhook(rawBody: string): string {
  return createHmac('sha256', `fake-payments:${env.JOBS_SECRET}`).update(rawBody).digest('hex');
}

/**
 * Simulated provider for development, tests and e2e (research R8): the checkout is a local page
 * (`/support/fake-checkout`) and payments arrive as HMAC-signed fake webhooks.
 */
export class FakePaymentGateway implements PaymentGateway {
  constructor(readonly name: ProviderName) {}

  private ensureAvailable(): void {
    const down = env.FAKE_PAYMENTS_UNAVAILABLE.split(',').map((p) => p.trim().toUpperCase());
    if (down.includes(this.name))
      throw new ProviderUnavailableError(`${this.name} (fake) unavailable`);
  }

  private checkout(
    request: CheckoutRequest,
    kind: 'ONE_TIME' | 'MONTHLY',
  ): Promise<CheckoutResult> {
    this.ensureAvailable();
    const checkoutId = `fake_${request.checkoutKey}`;
    const params = new URLSearchParams({
      id: request.id,
      kind,
      provider: this.name,
      session: checkoutId,
      amount: String(request.amountCents / 100),
    });
    return Promise.resolve({
      checkoutId,
      redirectUrl: `${env.APP_URL}/support/fake-checkout?${params.toString()}`,
      ...(kind === 'MONTHLY' &&
        this.name === 'PAYPAL' && { providerSubscriptionId: `fake_sub_${request.checkoutKey}` }),
    });
  }

  createOneTimeCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    return this.checkout(request, 'ONE_TIME');
  }

  createSubscriptionCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    return this.checkout(request, 'MONTHLY');
  }

  expireCheckout(): Promise<void> {
    return Promise.resolve();
  }

  captureOrder(): Promise<void> {
    return Promise.resolve();
  }

  cancelSubscription(): Promise<void> {
    this.ensureAvailable();
    return Promise.resolve();
  }

  createManageLink(_providerSubscriptionId: string, returnUrl: string): Promise<string | null> {
    return Promise.resolve(this.name === 'STRIPE' ? returnUrl : null);
  }

  verifyAndParseWebhook(rawBody: Buffer, headers: WebhookHeaders): Promise<WebhookBatch> {
    const signature = headers[FAKE_SIGNATURE_HEADER] ?? '';
    const expected = Buffer.from(signFakeWebhook(rawBody.toString('utf8')));
    const given = Buffer.from(signature);
    if (given.length !== expected.length || !timingSafeEqual(given, expected))
      throw new WebhookSignatureError();
    const event = FakeWebhookSchema.parse(JSON.parse(rawBody.toString('utf8')));
    return Promise.resolve({
      eventId: event.id,
      type: `fake.${event.kind}.${event.outcome}`,
      events: fakeEvents(event),
    });
  }
}

function fakeEvents(e: FakeWebhook): NormalizedEvent[] {
  if (e.kind === 'ONE_TIME') {
    if (e.outcome === 'paid')
      return [
        {
          type: 'one_time_paid',
          donationId: e.target,
          checkoutId: e.checkoutId,
          paymentId: `pay_${e.checkoutId}`,
        },
      ];
    if (e.outcome === 'canceled') return [{ type: 'one_time_canceled', donationId: e.target }];
    return [{ type: 'one_time_failed', donationId: e.target, checkoutId: e.checkoutId }];
  }
  if (e.outcome !== 'paid')
    return [{ type: 'subscription_checkout_expired', subscriptionId: e.target }];
  const providerSubscriptionId = `fake_sub_${e.checkoutId.replace(/^fake_/, '')}`;
  const periodStart = new Date();
  return [
    { type: 'subscription_linked', subscriptionId: e.target, providerSubscriptionId },
    {
      type: 'subscription_charge_paid',
      subscriptionId: e.target,
      providerSubscriptionId,
      paymentId: `pay_${randomUUID()}`,
      periodStart,
      periodEnd: addOneMonth(periodStart),
    },
  ];
}

/** Builds a signed fake webhook body (dev-only checkout page and tests). */
export function buildFakeWebhook(event: Omit<FakeWebhook, 'id'> & { id?: string }): {
  body: string;
  signature: string;
} {
  const body = JSON.stringify({ ...event, id: event.id ?? `evt_fake_${randomUUID()}` });
  return { body, signature: signFakeWebhook(body) };
}
