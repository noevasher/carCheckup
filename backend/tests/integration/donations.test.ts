import { randomUUID } from 'node:crypto';
import supertest from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { renderDigestEmail } from '../../src/lib/email/templates';
import { ProviderUnavailableError, setGatewayForTests } from '../../src/lib/payments';
import { normalizePayPalEvent } from '../../src/lib/payments/paypal-provider';
import { StripeGateway } from '../../src/lib/payments/stripe-provider';
import { prisma } from '../../src/lib/prisma';
import { applyPaymentEvent } from '../../src/modules/donations/apply-event';
import {
  sendFakeEvent,
  sendStripeEvent,
  sentEmails,
  STRIPE_WEBHOOK_SECRET,
} from '../donations-support';
import { createTestContext, resetDatabase } from '../helpers';

const DAY = 86_400_000;
let ctx: Awaited<ReturnType<typeof createTestContext>>;
let user: Awaited<ReturnType<Awaited<ReturnType<typeof createTestContext>>['userAgent']>>;

beforeAll(async () => {
  ctx = await createTestContext();
});

beforeEach(async () => {
  await resetDatabase();
  user = await ctx.userAgent();
  await user.get('/v1/me');
});

afterEach(() => {
  setGatewayForTests('STRIPE', null);
});

const start = (
  body: Partial<{ kind: string; amount: number; provider: string; checkoutKey: string }> = {},
) =>
  user.post('/v1/donations', {
    kind: 'ONE_TIME',
    amount: 100,
    provider: 'STRIPE',
    checkoutKey: randomUUID(),
    ...body,
  });

async function startAndPay(amount = 100, provider: 'STRIPE' | 'PAYPAL' = 'STRIPE') {
  const res = await start({ amount, provider });
  const donation = await prisma.donation.findUniqueOrThrow({ where: { id: res.body.donationId } });
  await sendFakeEvent(ctx.app, {
    provider,
    outcome: 'paid',
    kind: 'ONE_TIME',
    target: donation.id,
    checkoutId: donation.providerCheckoutId ?? '',
  }).expect(200);
  return donation;
}

const expectDaysAhead = (iso: string | null, days: number) => {
  expect(iso).not.toBeNull();
  const diff = new Date(iso ?? '').getTime() - Date.now();
  expect(Math.round(diff / DAY)).toBe(days);
};

describe('one-time donations (US1)', () => {
  it('config lists both providers, presets and limits (FR-001, FR-002, FR-015)', async () => {
    const res = await user.get('/v1/donations/config');
    expect(res.body).toMatchObject({
      providers: ['STRIPE', 'PAYPAL'],
      presets: [50, 100, 200],
      minAmount: 20,
      maxAmount: 10000,
      currency: 'MXN',
      adFreeUntil: null,
      subscription: null,
      supportEmail: 'soporte@test.dev',
    });
  });

  it('starts a checkout and a double tap reuses it (research R4)', async () => {
    const checkoutKey = randomUUID();
    const first = await start({ checkoutKey });
    const second = await start({ checkoutKey });
    expect(first.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(first.body.redirectUrl).toContain('/support/fake-checkout?');
    expect(await prisma.donation.count()).toBe(1);
    const result = await user.get(`/v1/donations/${first.body.donationId as string}`);
    expect(result.body).toMatchObject({
      status: 'PENDING',
      kind: 'ONE_TIME',
      amount: 100,
      provider: 'STRIPE',
    });
  });

  it('rejects amounts out of range and unknown ids (FR-003)', async () => {
    expect((await start({ amount: 19 })).status).toBe(422);
    expect((await start({ amount: 10_001 })).status).toBe(422);
    expect((await start({ amount: 50.5 })).status).toBe(422);
    expect((await user.get(`/v1/donations/${randomUUID()}`)).status).toBe(404);
  });

  it('confirms only through the signed webhook and grants the benefit (FR-006, FR-013)', async () => {
    const donation = await startAndPay(100);
    const result = await user.get(`/v1/donations/${donation.id}`);
    expect(result.body.status).toBe('CONFIRMED');
    expectDaysAhead(result.body.adFreeUntil as string, 60);
    expectDaysAhead((await user.get('/v1/me')).body.adFreeUntil as string, 60);
  });

  it('cancel and failure end as CANCELED / FAILED without benefit (US1-4)', async () => {
    const res = await start();
    const donation = await prisma.donation.findUniqueOrThrow({
      where: { id: res.body.donationId },
    });
    await sendFakeEvent(ctx.app, {
      provider: 'STRIPE',
      outcome: 'canceled',
      kind: 'ONE_TIME',
      target: donation.id,
      checkoutId: donation.providerCheckoutId ?? '',
    });
    expect((await user.get(`/v1/donations/${donation.id}`)).body.status).toBe('CANCELED');
    expect((await user.get('/v1/me')).body.adFreeUntil).toBeNull();
  });

  it('provider not responding → 502 and nothing pending (FR-015)', async () => {
    setGatewayForTests('STRIPE', {
      name: 'STRIPE',
      createOneTimeCheckout: () => Promise.reject(new ProviderUnavailableError('down')),
    } as unknown as StripeGateway);
    const res = await start();
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('PROVIDER_UNAVAILABLE');
    expect(await prisma.donation.count()).toBe(0);
  });

  it('rejects fake webhooks with a bad signature', async () => {
    const res = await supertest(ctx.app)
      .post('/webhooks/fake/stripe')
      .set('Content-Type', 'application/json')
      .set('x-fake-signature', 'nope')
      .send(
        JSON.stringify({
          provider: 'STRIPE',
          id: 'evt_x',
          outcome: 'paid',
          kind: 'ONE_TIME',
          target: randomUUID(),
          checkoutId: 'x',
        }),
      );
    expect(res.status).toBe(400);
  });
});

describe('Stripe webhooks (research R1, R3, R4)', () => {
  beforeEach(() => {
    setGatewayForTests('STRIPE', new StripeGateway('sk_test_placeholder', STRIPE_WEBHOOK_SECRET));
  });

  async function pendingDonation(amount = 100) {
    return prisma.donation.create({
      data: {
        userId: user.userId,
        kind: 'ONE_TIME',
        provider: 'STRIPE',
        amountCents: amount * 100,
        adFreeDays: (amount * 30) / 50,
        checkoutKey: randomUUID(),
        providerCheckoutId: `cs_${randomUUID()}`,
      },
    });
  }

  const completed = (donationId: string, sessionId: string, pi = `pi_${randomUUID()}`) => ({
    type: 'checkout.session.completed',
    object: {
      id: sessionId,
      object: 'checkout.session',
      mode: 'payment',
      payment_status: 'paid',
      payment_intent: pi,
      metadata: { donationId },
    },
  });

  it('confirms once even if the event is delivered twice (FR-007, SC-002)', async () => {
    const donation = await pendingDonation(50);
    const event = {
      id: `evt_${randomUUID()}`,
      ...completed(donation.id, donation.providerCheckoutId ?? ''),
    };
    expect((await sendStripeEvent(ctx.app, event)).status).toBe(200);
    expect((await sendStripeEvent(ctx.app, event)).status).toBe(200);
    expect((await prisma.donation.findUniqueOrThrow({ where: { id: donation.id } })).status).toBe(
      'CONFIRMED',
    );
    expect(await prisma.paymentEvent.count()).toBe(1);
    expect(
      sentEmails().filter((m) => m.idempotencyKey === `donation-thanks:${donation.id}`),
    ).toHaveLength(1);
  });

  it('ignores an invalid signature without changes', async () => {
    const donation = await pendingDonation();
    const res = await sendStripeEvent(
      ctx.app,
      completed(donation.id, donation.providerCheckoutId ?? ''),
      'whsec_wrong_secret',
    );
    expect(res.status).toBe(400);
    expect((await prisma.donation.findUniqueOrThrow({ where: { id: donation.id } })).status).toBe(
      'PENDING',
    );
  });

  it('expired session → CANCELED; refund → REFUNDED and benefit removed (FR-009, FR-014d)', async () => {
    const expired = await pendingDonation();
    await sendStripeEvent(ctx.app, {
      type: 'checkout.session.expired',
      object: {
        id: expired.providerCheckoutId,
        object: 'checkout.session',
        mode: 'payment',
        metadata: { donationId: expired.id },
      },
    });
    expect((await prisma.donation.findUniqueOrThrow({ where: { id: expired.id } })).status).toBe(
      'CANCELED',
    );

    const paid = await pendingDonation();
    const pi = `pi_${randomUUID()}`;
    await sendStripeEvent(ctx.app, completed(paid.id, paid.providerCheckoutId ?? '', pi));
    expect((await user.get('/v1/me')).body.adFreeUntil).not.toBeNull();
    await sendStripeEvent(ctx.app, {
      type: 'charge.refunded',
      object: { id: `ch_${randomUUID()}`, object: 'charge', refunded: true, payment_intent: pi },
    });
    expect((await prisma.donation.findUniqueOrThrow({ where: { id: paid.id } })).status).toBe(
      'REFUNDED',
    );
    expect((await user.get('/v1/me')).body.adFreeUntil).toBeNull();
  });

  it('dispute removes the days and a won dispute restores them (US4-5)', async () => {
    const paid = await pendingDonation();
    const pi = `pi_${randomUUID()}`;
    await sendStripeEvent(ctx.app, completed(paid.id, paid.providerCheckoutId ?? '', pi));
    await sendStripeEvent(ctx.app, {
      type: 'charge.dispute.created',
      object: {
        id: `dp_${randomUUID()}`,
        object: 'dispute',
        payment_intent: pi,
        status: 'needs_response',
      },
    });
    expect((await user.get('/v1/me')).body.adFreeUntil).toBeNull();
    await sendStripeEvent(ctx.app, {
      type: 'charge.dispute.closed',
      object: { id: `dp_${randomUUID()}`, object: 'dispute', payment_intent: pi, status: 'won' },
    });
    expect((await prisma.donation.findUniqueOrThrow({ where: { id: paid.id } })).status).toBe(
      'CONFIRMED',
    );
    expectDaysAhead((await user.get('/v1/me')).body.adFreeUntil as string, 60);
  });
});

describe('PayPal events (research R2)', () => {
  it('maps capture, refund and subscription events', () => {
    const donationId = randomUUID();
    expect(
      normalizePayPalEvent('PAYMENT.CAPTURE.COMPLETED', {
        id: 'CAP1',
        custom_id: donationId,
        supplementary_data: { related_ids: { order_id: 'ORD1' } },
      }),
    ).toEqual([{ type: 'one_time_paid', donationId, checkoutId: 'ORD1', paymentId: 'CAP1' }]);
    expect(
      normalizePayPalEvent('PAYMENT.CAPTURE.REFUNDED', {
        id: 'REF1',
        links: [{ rel: 'up', href: 'https://api/v2/payments/captures/CAP1' }],
      }),
    ).toEqual([{ type: 'payment_refunded', paymentId: 'CAP1' }]);
    expect(normalizePayPalEvent('BILLING.SUBSCRIPTION.CANCELLED', { id: 'I-SUB' })).toEqual([
      { type: 'subscription_canceled', providerSubscriptionId: 'I-SUB' },
    ]);
    const sale = normalizePayPalEvent('PAYMENT.SALE.COMPLETED', {
      id: 'SALE1',
      billing_agreement_id: 'I-SUB',
      create_time: '2026-06-10T00:00:00Z',
    });
    expect(sale[0]).toMatchObject({
      type: 'subscription_charge_paid',
      providerSubscriptionId: 'I-SUB',
      paymentId: 'SALE1',
      periodEnd: new Date('2026-07-10T00:00:00Z'),
    });
    expect(normalizePayPalEvent('CHECKOUT.ORDER.APPROVED', { id: 'ORD1' })).toEqual([
      { type: 'one_time_approved', checkoutId: 'ORD1' },
    ]);
    expect(normalizePayPalEvent('SOMETHING.ELSE', {})).toEqual([]);
  });

  it('a PayPal capture confirms the matching donation', async () => {
    const donation = await prisma.donation.create({
      data: {
        userId: user.userId,
        kind: 'ONE_TIME',
        provider: 'PAYPAL',
        amountCents: 5000,
        adFreeDays: 30,
        checkoutKey: randomUUID(),
        providerCheckoutId: 'ORD1',
      },
    });
    const events = normalizePayPalEvent('PAYMENT.CAPTURE.COMPLETED', {
      id: 'CAP1',
      custom_id: donation.id,
    });
    const result = await applyPaymentEvent('PAYPAL', {
      eventId: 'WH-1',
      type: 'PAYMENT.CAPTURE.COMPLETED',
      events,
    });
    expect(result.confirmedDonationIds).toEqual([donation.id]);
    expectDaysAhead((await user.get('/v1/me')).body.adFreeUntil as string, 30);
  });
});

describe('history and thank-you email (US3)', () => {
  it('lists confirmed and recent pending donations, newest first (FR-010, U2)', async () => {
    await startAndPay(50);
    await start({ amount: 200 });
    const old = await start({ amount: 100 });
    await prisma.donation.update({
      where: { id: old.body.donationId },
      data: { createdAt: new Date(Date.now() - 25 * 3_600_000) },
    });
    const res = await user.get('/v1/donations');
    expect(
      res.body.items.map((i: { amount: number; status: string }) => [i.amount, i.status]),
    ).toEqual([
      [200, 'PENDING'],
      [50, 'CONFIRMED'],
    ]);
    expect(res.body.supportEmail).toBe('soporte@test.dev');
  });

  it('sends the receipt even after unsubscribing from reminders, never to bounced addresses (Q1)', async () => {
    await prisma.profile.update({
      where: { id: user.userId },
      data: { emailUnsubscribedAt: new Date() },
    });
    const first = await startAndPay(50);
    const mail = sentEmails().find((m) => m.idempotencyKey === `donation-thanks:${first.id}`);
    expect(mail?.to).toBe(`${user.userId}@test.dev`);
    expect(mail?.text).toContain('Monto: $50 MXN');
    expect(mail?.text).not.toMatch(/\d{4} \d{4}/);

    await prisma.profile.update({ where: { id: user.userId }, data: { emailStatus: 'BOUNCED' } });
    const second = await startAndPay(50);
    expect(sentEmails().some((m) => m.idempotencyKey === `donation-thanks:${second.id}`)).toBe(
      false,
    );
  });
});

describe('ad-free benefit (US4)', () => {
  it('stacks one-time donations (FR-013)', async () => {
    await startAndPay(50);
    await startAndPay(100);
    expectDaysAhead((await user.get('/v1/me')).body.adFreeUntil as string, 90);
    expectDaysAhead((await user.get('/v1/donations/config')).body.adFreeUntil as string, 90);
  });
});

describe('donation card (US5, FR-012a/b)', () => {
  async function addService() {
    const vehicle = await user.post('/v1/vehicles', {
      make: 'Kia',
      model: 'Rio',
      year: 2018,
      odometerKm: 10_000,
      initialReadingId: randomUUID(),
    });
    await prisma.serviceRecord.create({
      data: {
        id: randomUUID(),
        vehicleId: vehicle.body.id as string,
        performedAt: new Date(),
        odometerKm: 10_000,
      },
    });
  }

  it('shows only after a service, hides for 90 days after closing and for donors', async () => {
    expect((await user.get('/v1/me')).body.showDonationCard).toBe(false);
    await addService();
    expect((await user.get('/v1/me')).body.showDonationCard).toBe(true);

    expect((await user.post('/v1/donations/card/dismiss', {})).status).toBe(204);
    expect((await user.get('/v1/me')).body.showDonationCard).toBe(false);
    await prisma.profile.update({
      where: { id: user.userId },
      data: { donationCardDismissedAt: new Date(Date.now() - 89 * DAY) },
    });
    expect((await user.get('/v1/me')).body.showDonationCard).toBe(false);
    await prisma.profile.update({
      where: { id: user.userId },
      data: { donationCardDismissedAt: new Date(Date.now() - 90 * DAY) },
    });
    expect((await user.get('/v1/me')).body.showDonationCard).toBe(true);

    await startAndPay(50);
    expect((await user.get('/v1/me')).body.showDonationCard).toBe(false);
  });

  it('the daily reminders email never mentions donations', () => {
    const vehicle = { id: randomUUID(), nickname: null, make: 'Toyota', model: 'Corolla' };
    const { html, text } = renderDigestEmail({
      selection: {
        groups: [
          {
            vehicle,
            notices: [
              {
                kind: 'MILEAGE_UPDATE',
                typeCode: null,
                vehicleId: vehicle.id,
                remainingKm: null,
                overdueDays: null,
                estimatedDueAt: null,
              },
            ],
          },
        ],
        shown: [],
        hiddenCount: 0,
      },
      appUrl: 'http://app.test',
      unsubscribeUrl: 'http://app.test/unsubscribe',
      today: '2026-10-23',
      timeZone: 'America/Mexico_City',
    } as unknown as Parameters<typeof renderDigestEmail>[0]);
    expect(`${html}${text}`).not.toMatch(/don(a|á)/i);
  });
});
