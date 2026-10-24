import type { PaymentProvider as ProviderName } from '@car-checkup/shared/prisma/enums';

export interface CheckoutRequest {
  /** Donation id (one-time) or DonationSubscription id (monthly). */
  id: string;
  amountCents: number;
  /** Idempotency key of the start request (research R4). */
  checkoutKey: string;
  successUrl: string;
  cancelUrl: string;
  email: string | null;
}

export interface CheckoutResult {
  /** Stripe Checkout session / PayPal order / PayPal subscription id. */
  checkoutId: string;
  redirectUrl: string;
  /** PayPal returns the subscription id up front. */
  providerSubscriptionId?: string;
}

/**
 * Provider-agnostic payment events (contracts/payments.md). Providers only translate their
 * webhooks into these; states and the ad-free benefit are handled in one place (apply-event.ts).
 */
export type NormalizedEvent =
  | {
      type: 'one_time_paid';
      donationId: string | null;
      checkoutId: string | null;
      paymentId: string;
    }
  | { type: 'one_time_canceled'; donationId: string }
  | { type: 'one_time_failed'; donationId: string | null; checkoutId: string | null }
  | { type: 'one_time_approved'; checkoutId: string }
  | { type: 'subscription_linked'; subscriptionId: string | null; providerSubscriptionId: string }
  | { type: 'subscription_checkout_expired'; subscriptionId: string }
  | {
      type: 'subscription_charge_paid';
      subscriptionId: string | null;
      providerSubscriptionId: string;
      paymentId: string;
      periodStart: Date;
      periodEnd: Date;
    }
  | { type: 'subscription_charge_failed'; providerSubscriptionId: string }
  | { type: 'subscription_canceled'; providerSubscriptionId: string }
  | { type: 'payment_refunded'; paymentId: string }
  | { type: 'payment_disputed'; paymentId: string }
  | { type: 'dispute_closed'; paymentId: string; won: boolean };

export interface WebhookBatch {
  eventId: string;
  type: string;
  events: NormalizedEvent[];
}

export type WebhookHeaders = Record<string, string | undefined>;

/** Payment provider adapter (research R8). */
export interface PaymentGateway {
  readonly name: ProviderName;
  createOneTimeCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  createSubscriptionCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  /** Cancels a checkout that was not completed (best effort). */
  expireCheckout(checkoutId: string, kind: 'ONE_TIME' | 'MONTHLY'): Promise<void>;
  /** PayPal only: capture an approved order. Never confirms by itself (research R3). */
  captureOrder(checkoutId: string): Promise<void>;
  /** Stops future charges; the benefit lasts until the paid period ends (FR-014b). */
  cancelSubscription(providerSubscriptionId: string): Promise<void>;
  /** Link to update the payment method, or null when the provider has none (FR-014c). */
  createManageLink(providerSubscriptionId: string, returnUrl: string): Promise<string | null>;
  /** Verifies the signature (throws WebhookSignatureError) and normalizes the event. */
  verifyAndParseWebhook(rawBody: Buffer, headers: WebhookHeaders): Promise<WebhookBatch>;
}

export class WebhookSignatureError extends Error {
  constructor(message = 'invalid webhook signature', options?: ErrorOptions) {
    super(message, options);
    this.name = 'WebhookSignatureError';
  }
}

/** The provider did not answer or rejected the request (→ 502 PROVIDER_UNAVAILABLE). */
export class ProviderUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ProviderUnavailableError';
  }
}

export const DAY_MS = 86_400_000;

/** One calendar month after `from` (PayPal sale periods). */
export function addOneMonth(from: Date): Date {
  const next = new Date(from);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}
