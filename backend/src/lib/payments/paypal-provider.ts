import { z } from 'zod';
import { prisma } from '../prisma';
import { PayPalApiError, type PayPalClient } from './paypal-client';
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

const PRODUCT_ID = 'CAR-CHECKUP-MONTHLY-DONATION';

const LinksSchema = z.array(z.object({ rel: z.string(), href: z.string() }));
const CreatedSchema = z.object({ id: z.string().min(1), links: LinksSchema.optional() });
const IdSchema = z.object({ id: z.string().min(1) });
const AnySchema = z.unknown();
const VerifySchema = z.object({ verification_status: z.string() });

const WebhookEventSchema = z.object({
  id: z.string().min(1).max(255),
  event_type: z.string().max(100),
  resource: z.looseObject({}),
});

const CaptureResource = z.looseObject({
  id: z.string(),
  custom_id: z.string().optional(),
  supplementary_data: z
    .looseObject({ related_ids: z.looseObject({ order_id: z.string().optional() }).optional() })
    .optional(),
  links: LinksSchema.optional(),
});
const SubscriptionResource = z.looseObject({ id: z.string(), custom_id: z.string().optional() });
const SaleResource = z.looseObject({
  id: z.string(),
  billing_agreement_id: z.string().optional(),
  sale_id: z.string().optional(),
  create_time: z.string().optional(),
});
const DisputeResource = z.looseObject({
  disputed_transactions: z
    .array(z.looseObject({ seller_transaction_id: z.string().optional() }))
    .optional(),
  dispute_outcome: z.looseObject({ outcome_code: z.string().optional() }).optional(),
});

const money = (cents: number) => ({ currency_code: 'MXN', value: (cents / 100).toFixed(2) });
const approveLink = (links: z.infer<typeof LinksSchema> | undefined): string | undefined =>
  links?.find((l) => l.rel === 'approve' || l.rel === 'payer-action')?.href;
const uuidOrNull = (value: string | undefined): string | null =>
  value !== undefined && z.uuid().safeParse(value).success ? value : null;

/** PayPal Orders v2 (one-time) and Subscriptions with one plan per amount (research R2). */
export class PayPalGateway implements PaymentGateway {
  readonly name = 'PAYPAL' as const;

  constructor(
    private readonly client: PayPalClient,
    private readonly webhookId: string,
  ) {}

  async createOneTimeCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const order = await this.client.request('POST', '/v2/checkout/orders', CreatedSchema, {
      requestId: `donation-${request.checkoutKey}`,
      body: {
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: money(request.amountCents),
            custom_id: request.id,
            description: 'Donación a Car Checkup',
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              return_url: request.successUrl,
              cancel_url: request.cancelUrl,
              user_action: 'PAY_NOW',
              shipping_preference: 'NO_SHIPPING',
              locale: 'es-MX',
              brand_name: 'Car Checkup',
            },
          },
        },
      },
    });
    const url = approveLink(order.links);
    if (url === undefined) throw new ProviderUnavailableError('PayPal order without approve link');
    return { checkoutId: order.id, redirectUrl: url };
  }

  private async planFor(amountCents: number): Promise<string> {
    const env = this.client.environment;
    const stored = await prisma.payPalPlan.findUnique({
      where: { amountCents_env: { amountCents, env } },
    });
    if (stored !== null) return stored.planId;
    try {
      await this.client.request('POST', '/v1/catalogs/products', AnySchema, {
        requestId: `product-${PRODUCT_ID}`,
        body: { id: PRODUCT_ID, name: 'Donación mensual a Car Checkup', type: 'SERVICE' },
      });
    } catch (err) {
      // Already created by an earlier plan.
      if (!(err instanceof PayPalApiError && err.status === 422)) throw err;
    }
    const plan = await this.client.request('POST', '/v1/billing/plans', IdSchema, {
      requestId: `plan-${env}-${String(amountCents)}`,
      body: {
        product_id: PRODUCT_ID,
        name: `Donación mensual de ${String(amountCents / 100)} MXN`,
        billing_cycles: [
          {
            frequency: { interval_unit: 'MONTH', interval_count: 1 },
            tenure_type: 'REGULAR',
            sequence: 1,
            total_cycles: 0,
            pricing_scheme: { fixed_price: money(amountCents) },
          },
        ],
        payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 1 },
      },
    });
    await prisma.payPalPlan.createMany({
      data: [{ amountCents, env, planId: plan.id }],
      skipDuplicates: true,
    });
    return (
      await prisma.payPalPlan.findUniqueOrThrow({
        where: { amountCents_env: { amountCents, env } },
      })
    ).planId;
  }

  async createSubscriptionCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const planId = await this.planFor(request.amountCents);
    const subscription = await this.client.request(
      'POST',
      '/v1/billing/subscriptions',
      CreatedSchema,
      {
        requestId: `subscription-${request.checkoutKey}`,
        body: {
          plan_id: planId,
          custom_id: request.id,
          application_context: {
            return_url: request.successUrl,
            cancel_url: request.cancelUrl,
            user_action: 'SUBSCRIBE_NOW',
            shipping_preference: 'NO_SHIPPING',
            locale: 'es-MX',
            brand_name: 'Car Checkup',
          },
        },
      },
    );
    const url = approveLink(subscription.links);
    if (url === undefined)
      throw new ProviderUnavailableError('PayPal subscription without approve link');
    return {
      checkoutId: subscription.id,
      redirectUrl: url,
      providerSubscriptionId: subscription.id,
    };
  }

  /** Unapproved orders and subscriptions expire on their own at PayPal. */
  expireCheckout(): Promise<void> {
    return Promise.resolve();
  }

  async captureOrder(orderId: string): Promise<void> {
    try {
      await this.client.request(
        'POST',
        `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
        AnySchema,
        {
          requestId: `capture-${orderId}`,
        },
      );
    } catch (err) {
      // Captured before (return page and webhook both try): nothing to do.
      if (err instanceof PayPalApiError && err.issue === 'ORDER_ALREADY_CAPTURED') return;
      throw err;
    }
  }

  async cancelSubscription(providerSubscriptionId: string): Promise<void> {
    try {
      await this.client.request(
        'POST',
        `/v1/billing/subscriptions/${encodeURIComponent(providerSubscriptionId)}/cancel`,
        AnySchema,
        {
          body: { reason: 'Cancelada por el usuario desde Car Checkup' },
        },
      );
    } catch (err) {
      if (err instanceof PayPalApiError && err.issue === 'SUBSCRIPTION_STATUS_INVALID') return;
      throw err;
    }
  }

  /** PayPal has no portal link by API; the app shows instructions (FR-014c). */
  createManageLink(): Promise<string | null> {
    return Promise.resolve(null);
  }

  async verifyAndParseWebhook(rawBody: Buffer, headers: WebhookHeaders): Promise<WebhookBatch> {
    let json: unknown;
    try {
      json = JSON.parse(rawBody.toString('utf8'));
    } catch (err) {
      throw new WebhookSignatureError('invalid PayPal webhook body', { cause: err });
    }
    const verification = await this.client.request(
      'POST',
      '/v1/notifications/verify-webhook-signature',
      VerifySchema,
      {
        body: {
          auth_algo: headers['paypal-auth-algo'],
          cert_url: headers['paypal-cert-url'],
          transmission_id: headers['paypal-transmission-id'],
          transmission_sig: headers['paypal-transmission-sig'],
          transmission_time: headers['paypal-transmission-time'],
          webhook_id: this.webhookId,
          webhook_event: json,
        },
      },
    );
    if (verification.verification_status !== 'SUCCESS')
      throw new WebhookSignatureError('invalid PayPal signature');
    const event = WebhookEventSchema.parse(json);
    return {
      eventId: event.id,
      type: event.event_type,
      events: normalizePayPalEvent(event.event_type, event.resource),
    };
  }
}

/** Maps a verified PayPal event to normalized events (contracts/payments.md). */
export function normalizePayPalEvent(
  type: string,
  resource: Record<string, unknown>,
): NormalizedEvent[] {
  switch (type) {
    case 'CHECKOUT.ORDER.APPROVED': {
      const order = z.looseObject({ id: z.string() }).parse(resource);
      return [{ type: 'one_time_approved', checkoutId: order.id }];
    }
    case 'PAYMENT.CAPTURE.COMPLETED': {
      const capture = CaptureResource.parse(resource);
      return [
        {
          type: 'one_time_paid',
          donationId: uuidOrNull(capture.custom_id),
          checkoutId: capture.supplementary_data?.related_ids?.order_id ?? null,
          paymentId: capture.id,
        },
      ];
    }
    case 'PAYMENT.CAPTURE.DENIED': {
      const capture = CaptureResource.parse(resource);
      return [
        {
          type: 'one_time_failed',
          donationId: uuidOrNull(capture.custom_id),
          checkoutId: capture.supplementary_data?.related_ids?.order_id ?? null,
        },
      ];
    }
    case 'PAYMENT.CAPTURE.REFUNDED': {
      // The resource is the refund; its "up" link points to the captured payment.
      const refund = CaptureResource.parse(resource);
      const up = refund.links?.find((l) => l.rel === 'up')?.href;
      const paymentId = up?.split('/').pop();
      return paymentId === undefined ? [] : [{ type: 'payment_refunded', paymentId }];
    }
    case 'BILLING.SUBSCRIPTION.ACTIVATED': {
      const sub = SubscriptionResource.parse(resource);
      return [
        {
          type: 'subscription_linked',
          subscriptionId: uuidOrNull(sub.custom_id),
          providerSubscriptionId: sub.id,
        },
      ];
    }
    case 'PAYMENT.SALE.COMPLETED': {
      const sale = SaleResource.parse(resource);
      if (sale.billing_agreement_id === undefined) return [];
      const periodStart = sale.create_time !== undefined ? new Date(sale.create_time) : new Date();
      return [
        {
          type: 'subscription_charge_paid',
          subscriptionId: null,
          providerSubscriptionId: sale.billing_agreement_id,
          paymentId: sale.id,
          periodStart,
          periodEnd: addOneMonth(periodStart),
        },
      ];
    }
    case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
      return [
        {
          type: 'subscription_charge_failed',
          providerSubscriptionId: SubscriptionResource.parse(resource).id,
        },
      ];
    case 'BILLING.SUBSCRIPTION.CANCELLED':
    case 'BILLING.SUBSCRIPTION.SUSPENDED':
    case 'BILLING.SUBSCRIPTION.EXPIRED':
      return [
        {
          type: 'subscription_canceled',
          providerSubscriptionId: SubscriptionResource.parse(resource).id,
        },
      ];
    case 'PAYMENT.SALE.REFUNDED': {
      const refund = SaleResource.parse(resource);
      return refund.sale_id === undefined
        ? []
        : [{ type: 'payment_refunded', paymentId: refund.sale_id }];
    }
    case 'CUSTOMER.DISPUTE.CREATED':
    case 'CUSTOMER.DISPUTE.RESOLVED': {
      const dispute = DisputeResource.parse(resource);
      const paymentId = dispute.disputed_transactions?.[0]?.seller_transaction_id;
      if (paymentId === undefined) return [];
      if (type === 'CUSTOMER.DISPUTE.CREATED') return [{ type: 'payment_disputed', paymentId }];
      return [
        {
          type: 'dispute_closed',
          paymentId,
          won: dispute.dispute_outcome?.outcome_code === 'RESOLVED_SELLER_FAVOUR',
        },
      ];
    }
    default:
      return [];
  }
}
