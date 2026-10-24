import Stripe from 'stripe';
import {
  type CheckoutRequest,
  type CheckoutResult,
  type NormalizedEvent,
  type PaymentGateway,
  ProviderUnavailableError,
  type WebhookBatch,
  type WebhookHeaders,
  WebhookSignatureError,
} from './payment-provider';

const idOf = (value: string | { id: string } | null | undefined): string | null =>
  value === null || value === undefined ? null : typeof value === 'string' ? value : value.id;

const fromUnix = (seconds: number): Date => new Date(seconds * 1000);

/** Stripe Checkout (hosted page) for one-time and monthly donations (research R1). */
export class StripeGateway implements PaymentGateway {
  readonly name = 'STRIPE' as const;
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
  ) {
    this.stripe = new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 10_000 });
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (err) {
      throw new ProviderUnavailableError('Stripe request failed', { cause: err });
    }
  }

  private lineItem(
    request: CheckoutRequest,
    monthly: boolean,
  ): Stripe.Checkout.SessionCreateParams.LineItem {
    return {
      quantity: 1,
      price_data: {
        currency: 'mxn',
        unit_amount: request.amountCents,
        product_data: {
          name: monthly ? 'Donación mensual a Car Checkup' : 'Donación a Car Checkup',
        },
        ...(monthly && { recurring: { interval: 'month' } }),
      },
    };
  }

  async createOneTimeCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const session = await this.call(() =>
      this.stripe.checkout.sessions.create(
        {
          mode: 'payment',
          line_items: [this.lineItem(request, false)],
          success_url: request.successUrl,
          cancel_url: request.cancelUrl,
          client_reference_id: request.id,
          metadata: { donationId: request.id },
          payment_intent_data: { metadata: { donationId: request.id } },
          locale: 'es',
          ...(request.email !== null && { customer_email: request.email }),
        },
        { idempotencyKey: `donation:${request.checkoutKey}` },
      ),
    );
    if (session.url === null) throw new ProviderUnavailableError('Stripe session without url');
    return { checkoutId: session.id, redirectUrl: session.url };
  }

  async createSubscriptionCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const session = await this.call(() =>
      this.stripe.checkout.sessions.create(
        {
          mode: 'subscription',
          line_items: [this.lineItem(request, true)],
          success_url: request.successUrl,
          cancel_url: request.cancelUrl,
          client_reference_id: request.id,
          metadata: { subscriptionId: request.id },
          subscription_data: { metadata: { subscriptionId: request.id } },
          locale: 'es',
          ...(request.email !== null && { customer_email: request.email }),
        },
        { idempotencyKey: `subscription:${request.checkoutKey}` },
      ),
    );
    if (session.url === null) throw new ProviderUnavailableError('Stripe session without url');
    return { checkoutId: session.id, redirectUrl: session.url };
  }

  async expireCheckout(checkoutId: string): Promise<void> {
    await this.call(() => this.stripe.checkout.sessions.expire(checkoutId));
  }

  captureOrder(): Promise<void> {
    return Promise.resolve();
  }

  async cancelSubscription(providerSubscriptionId: string): Promise<void> {
    await this.call(() =>
      this.stripe.subscriptions.update(providerSubscriptionId, { cancel_at_period_end: true }),
    );
  }

  async createManageLink(
    providerSubscriptionId: string,
    returnUrl: string,
  ): Promise<string | null> {
    const subscription = await this.call(() =>
      this.stripe.subscriptions.retrieve(providerSubscriptionId),
    );
    const customer = idOf(subscription.customer);
    if (customer === null) return null;
    const portal = await this.call(() =>
      this.stripe.billingPortal.sessions.create({ customer, return_url: returnUrl, locale: 'es' }),
    );
    return portal.url;
  }

  async verifyAndParseWebhook(rawBody: Buffer, headers: WebhookHeaders): Promise<WebhookBatch> {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        headers['stripe-signature'] ?? '',
        this.webhookSecret,
      );
    } catch (err) {
      throw new WebhookSignatureError('invalid Stripe signature', { cause: err });
    }
    return { eventId: event.id, type: event.type, events: await this.normalize(event) };
  }

  private async normalize(event: Stripe.Event): Promise<NormalizedEvent[]> {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        if (session.mode === 'payment') {
          const paymentId = idOf(session.payment_intent);
          if (session.payment_status !== 'paid' || paymentId === null) return [];
          return [
            {
              type: 'one_time_paid',
              donationId: session.metadata?.['donationId'] ?? null,
              checkoutId: session.id,
              paymentId,
            },
          ];
        }
        const providerSubscriptionId = idOf(session.subscription);
        if (session.mode !== 'subscription' || providerSubscriptionId === null) return [];
        return [
          {
            type: 'subscription_linked',
            subscriptionId: session.metadata?.['subscriptionId'] ?? null,
            providerSubscriptionId,
          },
        ];
      }
      case 'checkout.session.async_payment_failed': {
        const session = event.data.object;
        return [
          {
            type: 'one_time_failed',
            donationId: session.metadata?.['donationId'] ?? null,
            checkoutId: session.id,
          },
        ];
      }
      case 'checkout.session.expired': {
        const session = event.data.object;
        const donationId = session.metadata?.['donationId'];
        const subscriptionId = session.metadata?.['subscriptionId'];
        if (donationId !== undefined) return [{ type: 'one_time_canceled', donationId }];
        if (subscriptionId !== undefined)
          return [{ type: 'subscription_checkout_expired', subscriptionId }];
        return [];
      }
      case 'invoice.paid': {
        const invoice = event.data.object;
        const details = invoice.parent?.subscription_details ?? null;
        const providerSubscriptionId = idOf(details?.subscription);
        const line = invoice.lines.data[0];
        if (providerSubscriptionId === null || line === undefined) return [];
        const paymentId = (await this.invoicePaymentIntent(invoice)) ?? invoice.id;
        return [
          {
            type: 'subscription_charge_paid',
            subscriptionId: details?.metadata?.['subscriptionId'] ?? null,
            providerSubscriptionId,
            paymentId,
            periodStart: fromUnix(line.period.start),
            periodEnd: fromUnix(line.period.end),
          },
        ];
      }
      case 'invoice.payment_failed': {
        const providerSubscriptionId = idOf(
          event.data.object.parent?.subscription_details?.subscription,
        );
        return providerSubscriptionId === null
          ? []
          : [{ type: 'subscription_charge_failed', providerSubscriptionId }];
      }
      case 'customer.subscription.deleted':
        return [{ type: 'subscription_canceled', providerSubscriptionId: event.data.object.id }];
      case 'charge.refunded': {
        const charge = event.data.object;
        const paymentId = idOf(charge.payment_intent);
        return charge.refunded && paymentId !== null
          ? [{ type: 'payment_refunded', paymentId }]
          : [];
      }
      case 'charge.dispute.created': {
        const paymentId = idOf(event.data.object.payment_intent);
        return paymentId === null ? [] : [{ type: 'payment_disputed', paymentId }];
      }
      case 'charge.dispute.closed': {
        const dispute = event.data.object;
        const paymentId = idOf(dispute.payment_intent);
        return paymentId === null
          ? []
          : [{ type: 'dispute_closed', paymentId, won: dispute.status === 'won' }];
      }
      default:
        return [];
    }
  }

  /** Monthly charges are matched to refunds and disputes by their payment intent. */
  private async invoicePaymentIntent(invoice: Stripe.Invoice): Promise<string | null> {
    const fromPayload = invoice.payments?.data.find((p) => p.payment.payment_intent !== undefined)
      ?.payment.payment_intent;
    if (fromPayload !== undefined) return idOf(fromPayload);
    const invoiceId = invoice.id;
    const payments = await this.call(() =>
      this.stripe.invoicePayments.list({ invoice: invoiceId, limit: 3 }),
    );
    const found = payments.data.find((p) => p.payment.payment_intent !== undefined)?.payment
      .payment_intent;
    return found === undefined ? null : idOf(found);
  }
}
