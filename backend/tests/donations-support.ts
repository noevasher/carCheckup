import { randomUUID } from 'node:crypto';
import supertest from 'supertest';
import Stripe from 'stripe';
import type { Express } from 'express';
import { getEmailSender, type LogEmailSender } from '../src/lib/email';
import { buildFakeWebhook, FAKE_SIGNATURE_HEADER } from '../src/lib/payments';

export const STRIPE_WEBHOOK_SECRET = 'whsec_test_stripe_0123456789abcdef';
const stripe = new Stripe('sk_test_placeholder');

/** Sends a Stripe event signed like Stripe does (research R8). */
export function sendStripeEvent(
  app: Express,
  event: { id?: string; type: string; object: object },
  secret = STRIPE_WEBHOOK_SECRET,
) {
  const payload = JSON.stringify({
    id: event.id ?? `evt_${randomUUID()}`,
    object: 'event',
    type: event.type,
    api_version: '2026-09-30.endive',
    created: Math.floor(Date.now() / 1000),
    data: { object: event.object },
  });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return supertest(app)
    .post('/webhooks/stripe')
    .set('Content-Type', 'application/json')
    .set('Stripe-Signature', header)
    .send(payload);
}

/** Sends a signed fake-provider webhook (fake mode). */
export function sendFakeEvent(app: Express, event: Parameters<typeof buildFakeWebhook>[0]) {
  const { body, signature } = buildFakeWebhook(event);
  return supertest(app)
    .post(`/webhooks/fake/${event.provider.toLowerCase()}`)
    .set('Content-Type', 'application/json')
    .set(FAKE_SIGNATURE_HEADER, signature)
    .send(body);
}

/** The log sender used in tests (EMAIL_PROVIDER=log). */
export const sentEmails = (): LogEmailSender['sent'] => (getEmailSender() as LogEmailSender).sent;
