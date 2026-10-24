import type { PaymentProvider } from '@car-checkup/shared/prisma/enums';
import type { NormalizedEvent, WebhookBatch } from '../../lib/payments';
import { prisma, type Tx } from '../../lib/prisma';
import { logger } from '../../middleware/logging';
import { recalculateAdFree } from './benefit.service';

export interface ApplyResult {
  duplicate: boolean;
  /** Donations confirmed by this event: the caller sends thank-you emails after the commit. */
  confirmedDonationIds: string[];
}

interface Effects {
  users: Set<string>;
  confirmed: string[];
}

/**
 * Applies one verified provider event (contracts/payments.md) in a single transaction: records
 * the event for idempotency (FR-007), applies only the allowed state transitions (data-model.md)
 * and recomputes the ad-free benefit of the affected users.
 */
export async function applyPaymentEvent(
  provider: PaymentProvider,
  batch: WebhookBatch,
  now: Date = new Date(),
): Promise<ApplyResult> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.paymentEvent.createMany({
      data: [{ provider, eventId: batch.eventId, type: batch.type }],
      skipDuplicates: true,
    });
    if (count === 0) return { duplicate: true, confirmedDonationIds: [] };

    const effects: Effects = { users: new Set(), confirmed: [] };
    for (const event of batch.events) await applyOne(tx, provider, event, now, effects);
    for (const userId of effects.users) await recalculateAdFree(tx, userId, now);
    if (effects.confirmed[0] !== undefined) {
      await tx.paymentEvent.update({
        where: { provider_eventId: { provider, eventId: batch.eventId } },
        data: { donationId: effects.confirmed[0] },
      });
    }
    return { duplicate: false, confirmedDonationIds: effects.confirmed };
  });
}

const ignored = (event: NormalizedEvent, reason: string): void => {
  logger.info({ event: event.type, reason }, 'payment event ignored');
};

async function findOneTime(
  tx: Tx,
  provider: PaymentProvider,
  donationId: string | null,
  checkoutId: string | null,
) {
  if (donationId !== null) {
    const byId = await tx.donation.findFirst({
      where: { id: donationId, provider, kind: 'ONE_TIME' },
    });
    if (byId !== null) return byId;
  }
  if (checkoutId !== null)
    return tx.donation.findFirst({
      where: { providerCheckoutId: checkoutId, provider, kind: 'ONE_TIME' },
    });
  return null;
}

async function findSubscription(
  tx: Tx,
  provider: PaymentProvider,
  subscriptionId: string | null,
  providerSubscriptionId: string,
) {
  const byProvider = await tx.donationSubscription.findFirst({
    where: { provider, providerSubscriptionId },
  });
  if (byProvider !== null || subscriptionId === null) return byProvider;
  return tx.donationSubscription.findFirst({ where: { id: subscriptionId, provider } });
}

async function applyOne(
  tx: Tx,
  provider: PaymentProvider,
  event: NormalizedEvent,
  now: Date,
  effects: Effects,
): Promise<void> {
  switch (event.type) {
    case 'one_time_paid': {
      const donation = await findOneTime(tx, provider, event.donationId, event.checkoutId);
      if (donation === null) {
        ignored(event, 'unknown donation');
        return;
      }
      // A late payment of an expired or failed checkout still counts; REFUNDED/DISPUTED are final here.
      if (!['PENDING', 'CANCELED', 'FAILED'].includes(donation.status)) {
        ignored(event, `status ${donation.status}`);
        return;
      }
      await tx.donation.update({
        where: { id: donation.id },
        data: { status: 'CONFIRMED', confirmedAt: now, providerPaymentId: event.paymentId },
      });
      if (donation.userId !== null) effects.users.add(donation.userId);
      effects.confirmed.push(donation.id);
      return;
    }
    case 'one_time_canceled':
    case 'one_time_failed': {
      const donation =
        event.type === 'one_time_canceled'
          ? await findOneTime(tx, provider, event.donationId, null)
          : await findOneTime(tx, provider, event.donationId, event.checkoutId);
      if (donation?.status !== 'PENDING') {
        ignored(event, 'not pending');
        return;
      }
      await tx.donation.update({
        where: { id: donation.id },
        data: { status: event.type === 'one_time_canceled' ? 'CANCELED' : 'FAILED' },
      });
      return;
    }
    case 'one_time_approved':
      // Capture happens outside the transaction (webhooks.routes.ts); nothing to store.
      return;
    case 'subscription_linked': {
      const sub = await findSubscription(
        tx,
        provider,
        event.subscriptionId,
        event.providerSubscriptionId,
      );
      if (sub === null) {
        ignored(event, 'unknown subscription');
        return;
      }
      if (sub.providerSubscriptionId === null) {
        await tx.donationSubscription.update({
          where: { id: sub.id },
          data: { providerSubscriptionId: event.providerSubscriptionId },
        });
      }
      return;
    }
    case 'subscription_checkout_expired': {
      const sub = await tx.donationSubscription.findFirst({
        where: { id: event.subscriptionId, provider },
      });
      if (sub?.status !== 'PENDING') {
        ignored(event, 'not pending');
        return;
      }
      await tx.donationSubscription.update({
        where: { id: sub.id },
        data: { status: 'CANCELED', canceledAt: now },
      });
      return;
    }
    case 'subscription_charge_paid': {
      const sub = await findSubscription(
        tx,
        provider,
        event.subscriptionId,
        event.providerSubscriptionId,
      );
      if (sub === null) {
        ignored(event, 'unknown subscription');
        return;
      }
      const existing = await tx.donation.findFirst({
        where: { provider, providerPaymentId: event.paymentId },
      });
      if (existing !== null) {
        ignored(event, 'charge already recorded');
        return;
      }
      const charge = await tx.donation.create({
        data: {
          userId: sub.userId,
          kind: 'MONTHLY_CHARGE',
          provider,
          amountCents: sub.amountCents,
          status: 'CONFIRMED',
          providerPaymentId: event.paymentId,
          subscriptionId: sub.id,
          periodStart: event.periodStart,
          periodEnd: event.periodEnd,
          confirmedAt: now,
        },
      });
      const paidUntil =
        sub.paidUntil === null || sub.paidUntil < event.periodEnd ? event.periodEnd : sub.paidUntil;
      await tx.donationSubscription.update({
        where: { id: sub.id },
        data: {
          providerSubscriptionId: sub.providerSubscriptionId ?? event.providerSubscriptionId,
          paidUntil,
          nextChargeAt: sub.status === 'CANCELED' ? null : paidUntil,
          // A charge after a local cancellation (provider still billing the paid period) keeps it canceled.
          ...(sub.status !== 'CANCELED' && { status: 'ACTIVE' }),
        },
      });
      if (sub.userId !== null) effects.users.add(sub.userId);
      effects.confirmed.push(charge.id);
      return;
    }
    case 'subscription_charge_failed': {
      const sub = await tx.donationSubscription.findFirst({
        where: { provider, providerSubscriptionId: event.providerSubscriptionId },
      });
      if (sub?.status !== 'ACTIVE') {
        ignored(event, 'not active');
        return;
      }
      await tx.donationSubscription.update({ where: { id: sub.id }, data: { status: 'PAST_DUE' } });
      return;
    }
    case 'subscription_canceled': {
      const sub = await tx.donationSubscription.findFirst({
        where: { provider, providerSubscriptionId: event.providerSubscriptionId },
      });
      if (sub === null || sub.status === 'CANCELED') {
        ignored(event, 'unknown or canceled');
        return;
      }
      await tx.donationSubscription.update({
        where: { id: sub.id },
        data: { status: 'CANCELED', canceledAt: sub.canceledAt ?? now, nextChargeAt: null },
      });
      return;
    }
    case 'payment_refunded':
    case 'payment_disputed':
    case 'dispute_closed': {
      const donation = await tx.donation.findFirst({
        where: { provider, providerPaymentId: event.paymentId },
      });
      if (donation === null) {
        ignored(event, 'unknown payment');
        return;
      }
      const next =
        event.type === 'payment_refunded'
          ? donation.status === 'CONFIRMED' || donation.status === 'DISPUTED'
            ? 'REFUNDED'
            : null
          : event.type === 'payment_disputed'
            ? donation.status === 'CONFIRMED'
              ? 'DISPUTED'
              : null
            : donation.status === 'DISPUTED'
              ? event.won
                ? 'CONFIRMED'
                : 'REFUNDED'
              : null;
      if (next === null) {
        ignored(event, `status ${donation.status}`);
        return;
      }
      await tx.donation.update({ where: { id: donation.id }, data: { status: next } });
      if (donation.userId !== null) effects.users.add(donation.userId);
      return;
    }
  }
}
