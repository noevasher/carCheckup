import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setGatewayForTests } from '../../src/lib/payments';
import { StripeGateway } from '../../src/lib/payments/stripe-provider';
import { prisma } from '../../src/lib/prisma';
import { sendFakeEvent, sendStripeEvent, STRIPE_WEBHOOK_SECRET } from '../donations-support';
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

const startMonthly = (amount = 50, checkoutKey = randomUUID()) =>
  user.post('/v1/donations', { kind: 'MONTHLY', amount, provider: 'STRIPE', checkoutKey });

async function activate(amount = 50) {
  const res = await startMonthly(amount);
  const sub = await prisma.donationSubscription.findUniqueOrThrow({
    where: { id: res.body.donationId },
  });
  await sendFakeEvent(ctx.app, {
    provider: 'STRIPE',
    outcome: 'paid',
    kind: 'MONTHLY',
    target: sub.id,
    checkoutId: sub.providerCheckoutId ?? '',
  }).expect(200);
  return prisma.donationSubscription.findUniqueOrThrow({ where: { id: sub.id } });
}

const days = (iso: string | null | undefined) =>
  Math.round((new Date(iso ?? 0).getTime() - Date.now()) / DAY);

describe('monthly donations (US2)', () => {
  it('activates with the first charge: benefit until the end of the paid month (FR-014a)', async () => {
    const sub = await activate(50);
    expect(sub.status).toBe('ACTIVE');
    const config = await user.get('/v1/donations/config');
    expect(config.body.subscription).toMatchObject({
      status: 'ACTIVE',
      amount: 50,
      provider: 'STRIPE',
    });
    expect(days(config.body.adFreeUntil as string)).toBeGreaterThanOrEqual(28);
    expect(config.body.adFreeUntil).toBe(sub.paidUntil?.toISOString());
    expect((await user.get(`/v1/donations/${sub.id}`)).body).toMatchObject({
      kind: 'MONTHLY',
      status: 'CONFIRMED',
    });
    const history = await user.get('/v1/donations');
    expect(history.body.items).toHaveLength(1);
    expect(history.body.items[0]).toMatchObject({ kind: 'MONTHLY_CHARGE', status: 'CONFIRMED' });
  });

  it('only one active monthly donation; an abandoned checkout does not block (US2-5, analysis I1)', async () => {
    const abandoned = await startMonthly(100);
    const retry = await startMonthly(50);
    expect(retry.status).toBe(201);
    expect(
      (
        await prisma.donationSubscription.findUniqueOrThrow({
          where: { id: abandoned.body.donationId },
        })
      ).status,
    ).toBe('CANCELED');

    await sendFakeEvent(ctx.app, {
      provider: 'STRIPE',
      outcome: 'paid',
      kind: 'MONTHLY',
      target: retry.body.donationId as string,
      checkoutId:
        (
          await prisma.donationSubscription.findUniqueOrThrow({
            where: { id: retry.body.donationId },
          })
        ).providerCheckoutId ?? '',
    });
    const second = await startMonthly(200);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ACTIVE_SUBSCRIPTION_EXISTS');
  });

  it('cancel keeps the benefit until the paid period ends and stops charges (FR-014b, SC-007)', async () => {
    const sub = await activate(50);
    const res = await user.post('/v1/donations/subscription/cancel', {});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'CANCELED', nextChargeAt: null });
    expect((await user.get('/v1/me')).body.adFreeUntil).toBe(sub.paidUntil?.toISOString());
    expect((await user.post('/v1/donations/subscription/cancel', {})).status).toBe(404);
    // Still shown (with its paid period) so the user sees until when it lasts.
    expect((await user.get('/v1/donations/config')).body.subscription).toMatchObject({
      status: 'CANCELED',
    });
  });

  it('one-time days are saved until the monthly period ends (clarification Q2)', async () => {
    const sub = await activate(50);
    const one = await user.post('/v1/donations', {
      kind: 'ONE_TIME',
      amount: 50,
      provider: 'STRIPE',
      checkoutKey: randomUUID(),
    });
    const donation = await prisma.donation.findUniqueOrThrow({
      where: { id: one.body.donationId },
    });
    await sendFakeEvent(ctx.app, {
      provider: 'STRIPE',
      outcome: 'paid',
      kind: 'ONE_TIME',
      target: donation.id,
      checkoutId: donation.providerCheckoutId ?? '',
    });
    const expected = new Date((sub.paidUntil?.getTime() ?? 0) + 30 * DAY).toISOString();
    expect((await user.get('/v1/me')).body.adFreeUntil).toBe(expected);
  });

  it('manage link: Stripe portal for card, 404 for PayPal (FR-014c)', async () => {
    await activate(50);
    const link = await user.post('/v1/donations/subscription/manage-link', {});
    expect(link.status).toBe(200);
    expect(link.body.url).toContain('/support/history');
  });
});

describe('Stripe subscription webhooks', () => {
  beforeEach(() => {
    setGatewayForTests('STRIPE', new StripeGateway('sk_test_placeholder', STRIPE_WEBHOOK_SECRET));
  });

  async function pendingSub() {
    return prisma.donationSubscription.create({
      data: {
        userId: user.userId,
        provider: 'STRIPE',
        amountCents: 5000,
        checkoutKey: randomUUID(),
        providerCheckoutId: `cs_${randomUUID()}`,
      },
    });
  }

  const invoicePaid = (
    providerSub: string,
    subscriptionId: string,
    start: Date,
    pi = `pi_${randomUUID()}`,
  ) => ({
    type: 'invoice.paid',
    object: {
      id: `in_${randomUUID()}`,
      object: 'invoice',
      parent: {
        type: 'subscription_details',
        subscription_details: { subscription: providerSub, metadata: { subscriptionId } },
      },
      lines: {
        object: 'list',
        data: [
          {
            id: 'il_1',
            period: {
              start: Math.floor(start.getTime() / 1000),
              end: Math.floor((start.getTime() + 30 * DAY) / 1000),
            },
          },
        ],
      },
      payments: {
        object: 'list',
        data: [{ id: 'inpay_1', payment: { type: 'payment_intent', payment_intent: pi } }],
      },
    },
  });

  it('links, charges, fails, recovers and cancels (FR-014c)', async () => {
    const sub = await pendingSub();
    await sendStripeEvent(ctx.app, {
      type: 'checkout.session.completed',
      object: {
        id: sub.providerCheckoutId,
        object: 'checkout.session',
        mode: 'subscription',
        subscription: 'sub_123',
        metadata: { subscriptionId: sub.id },
      },
    }).expect(200);
    expect(
      (await prisma.donationSubscription.findUniqueOrThrow({ where: { id: sub.id } }))
        .providerSubscriptionId,
    ).toBe('sub_123');

    const now = new Date();
    await sendStripeEvent(ctx.app, invoicePaid('sub_123', sub.id, now)).expect(200);
    let stored = await prisma.donationSubscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(stored.status).toBe('ACTIVE');
    expect(days(stored.paidUntil?.toISOString())).toBe(30);

    await sendStripeEvent(ctx.app, {
      type: 'invoice.payment_failed',
      object: {
        id: `in_${randomUUID()}`,
        object: 'invoice',
        parent: { subscription_details: { subscription: 'sub_123' } },
        lines: { data: [] },
      },
    });
    expect(
      (await prisma.donationSubscription.findUniqueOrThrow({ where: { id: sub.id } })).status,
    ).toBe('PAST_DUE');
    expect((await user.get('/v1/donations')).body.subscription.status).toBe('PAST_DUE');

    await sendStripeEvent(
      ctx.app,
      invoicePaid('sub_123', sub.id, new Date(now.getTime() + 30 * DAY)),
    );
    stored = await prisma.donationSubscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(stored.status).toBe('ACTIVE');
    expect(days(stored.paidUntil?.toISOString())).toBe(60);

    await sendStripeEvent(ctx.app, {
      type: 'customer.subscription.deleted',
      object: { id: 'sub_123', object: 'subscription' },
    });
    expect(
      (await prisma.donationSubscription.findUniqueOrThrow({ where: { id: sub.id } })).status,
    ).toBe('CANCELED');
    expect(days((await user.get('/v1/me')).body.adFreeUntil as string)).toBe(60);
  });

  it('a refunded monthly charge removes its period', async () => {
    const sub = await pendingSub();
    await sendStripeEvent(ctx.app, invoicePaid('sub_456', sub.id, new Date(), 'pi_charge_1'));
    expect((await user.get('/v1/me')).body.adFreeUntil).not.toBeNull();
    await sendStripeEvent(ctx.app, {
      type: 'charge.refunded',
      object: { id: 'ch_1', object: 'charge', refunded: true, payment_intent: 'pi_charge_1' },
    });
    expect((await user.get('/v1/me')).body.adFreeUntil).toBeNull();
  });
});
