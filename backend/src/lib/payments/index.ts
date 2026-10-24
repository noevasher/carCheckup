import type { PaymentProvider as ProviderName } from '@car-checkup/shared/prisma/enums';
import { env } from '../../config/env';
import { FakePaymentGateway } from './fake-provider';
import type { PaymentGateway } from './payment-provider';
import { PayPalClient } from './paypal-client';
import { PayPalGateway } from './paypal-provider';
import { StripeGateway } from './stripe-provider';

export type {
  CheckoutRequest,
  CheckoutResult,
  NormalizedEvent,
  PaymentGateway,
  WebhookBatch,
  WebhookHeaders,
} from './payment-provider';
export { ProviderUnavailableError, WebhookSignatureError } from './payment-provider';
export { FakePaymentGateway, buildFakeWebhook, FAKE_SIGNATURE_HEADER } from './fake-provider';

let gateways: Partial<Record<ProviderName, PaymentGateway>> | null = null;

function build(): Partial<Record<ProviderName, PaymentGateway>> {
  if (env.PAYMENTS_PROVIDER_MODE === 'fake') {
    return { STRIPE: new FakePaymentGateway('STRIPE'), PAYPAL: new FakePaymentGateway('PAYPAL') };
  }
  const result: Partial<Record<ProviderName, PaymentGateway>> = {};
  // A provider is offered only when all its variables exist (FR-015).
  if (env.STRIPE_SECRET_KEY !== undefined && env.STRIPE_WEBHOOK_SECRET !== undefined) {
    result.STRIPE = new StripeGateway(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET);
  }
  if (
    env.PAYPAL_CLIENT_ID !== undefined &&
    env.PAYPAL_CLIENT_SECRET !== undefined &&
    env.PAYPAL_WEBHOOK_ID !== undefined
  ) {
    result.PAYPAL = new PayPalGateway(
      new PayPalClient(env.PAYPAL_CLIENT_ID, env.PAYPAL_CLIENT_SECRET, env.PAYPAL_ENV),
      env.PAYPAL_WEBHOOK_ID,
    );
  }
  return result;
}

/** Gateway used to start payments and to read webhooks for `provider`, if configured. */
export function getGateway(provider: ProviderName): PaymentGateway | null {
  gateways ??= build();
  return gateways[provider] ?? null;
}

export function availableProviders(): ProviderName[] {
  return (['STRIPE', 'PAYPAL'] as const).filter((p) => getGateway(p) !== null);
}

/** Test helper: replace a provider's gateway (e.g. a real StripeGateway to test signatures). */
export function setGatewayForTests(provider: ProviderName, gateway: PaymentGateway | null): void {
  gateways ??= build();
  if (gateway === null) {
    gateways = build();
    return;
  }
  gateways[provider] = gateway;
}
