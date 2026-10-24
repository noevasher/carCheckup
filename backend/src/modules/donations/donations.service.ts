import type {
  DonationConfigDto,
  DonationHistoryDto,
  DonationResultDto,
  DonationStartResultDto,
  SubscriptionDto,
} from '@car-checkup/shared/dto';
import {
  DONATION_PRESETS,
  MAX_DONATION,
  MIN_DONATION,
  adFreeDays,
  toCents,
} from '@car-checkup/shared/donations';
import type { DonationSubscription, Prisma } from '@car-checkup/shared/prisma';
import type { DonationStartInput } from '@car-checkup/shared/schemas';
import { env } from '../../config/env';
import { HttpError, notFound, validationError } from '../../lib/http-error';
import {
  availableProviders,
  getGateway,
  type PaymentGateway,
  ProviderUnavailableError,
} from '../../lib/payments';
import { prisma } from '../../lib/prisma';
import { logger } from '../../middleware/logging';

const PENDING_TTL_MS = 24 * 3_600_000;
const providerUnavailable = (): HttpError => new HttpError(502, 'PROVIDER_UNAVAILABLE');

const iso = (d: Date | null): string | null => (d === null ? null : d.toISOString());
const isStalePending = (createdAt: Date, now: Date): boolean =>
  now.getTime() - createdAt.getTime() > PENDING_TTL_MS;

const resultUrl = (id: string, outcome: 'success' | 'cancel') =>
  `${env.APP_URL}/support/result?donation=${id}${outcome === 'cancel' ? '&canceled=1' : ''}`;

function gatewayFor(provider: DonationStartInput['provider']): PaymentGateway {
  const gateway = getGateway(provider);
  if (gateway === null) throw validationError({ provider: 'unavailable' });
  return gateway;
}

async function withProvider<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    if (err instanceof ProviderUnavailableError) {
      logger.warn({ err }, 'payment provider unavailable');
      throw providerUnavailable();
    }
    throw err;
  }
}

function subscriptionDto(sub: DonationSubscription): SubscriptionDto {
  return {
    id: sub.id,
    provider: sub.provider,
    amount: sub.amountCents / 100,
    status: sub.status,
    paidUntil: iso(sub.paidUntil),
    nextChargeAt: iso(sub.nextChargeAt),
  };
}

/** The user's current monthly donation: active, past due, or canceled with time still paid. */
async function currentSubscription(
  userId: string,
  now: Date,
): Promise<DonationSubscription | null> {
  const active = await prisma.donationSubscription.findFirst({
    where: { userId, status: { in: ['ACTIVE', 'PAST_DUE'] } },
  });
  if (active !== null) return active;
  return prisma.donationSubscription.findFirst({
    where: { userId, status: 'CANCELED', paidUntil: { gt: now } },
    orderBy: { paidUntil: 'desc' },
  });
}

async function adFreeUntilOf(userId: string, now: Date): Promise<string | null> {
  const profile = await prisma.profile.findUniqueOrThrow({
    where: { id: userId },
    select: { adFreeUntil: true },
  });
  return profile.adFreeUntil !== null && profile.adFreeUntil > now
    ? profile.adFreeUntil.toISOString()
    : null;
}

export async function getDonationConfig(
  userId: string,
  now = new Date(),
): Promise<DonationConfigDto> {
  const sub = await currentSubscription(userId, now);
  return {
    providers: availableProviders(),
    presets: [...DONATION_PRESETS],
    minAmount: MIN_DONATION,
    maxAmount: MAX_DONATION,
    currency: 'MXN',
    adFreeUntil: await adFreeUntilOf(userId, now),
    subscription: sub === null ? null : subscriptionDto(sub),
    supportEmail: env.SUPPORT_EMAIL ?? null,
  };
}

/** Starts a one-time or monthly donation; idempotent per `checkoutKey` (research R4). */
export async function startDonation(
  userId: string,
  email: string | null,
  input: DonationStartInput,
): Promise<DonationStartResultDto> {
  const gateway = gatewayFor(input.provider);
  return input.kind === 'ONE_TIME'
    ? startOneTime(userId, email, input, gateway)
    : startMonthly(userId, email, input, gateway);
}

async function startOneTime(
  userId: string,
  email: string | null,
  input: DonationStartInput,
  gateway: PaymentGateway,
): Promise<DonationStartResultDto> {
  const amountCents = toCents(input.amount);
  await prisma.donation.createMany({
    data: [
      {
        userId,
        kind: 'ONE_TIME',
        provider: input.provider,
        amountCents,
        checkoutKey: input.checkoutKey,
        adFreeDays: adFreeDays(input.amount),
      },
    ],
    skipDuplicates: true,
  });
  const donation = await prisma.donation.findUniqueOrThrow({
    where: { userId_checkoutKey: { userId, checkoutKey: input.checkoutKey } },
  });
  if (donation.status !== 'PENDING')
    return { donationId: donation.id, redirectUrl: resultUrl(donation.id, 'success') };
  try {
    // Same idempotency key → the provider returns the same checkout on a double tap.
    const checkout = await withProvider(() =>
      gateway.createOneTimeCheckout({
        id: donation.id,
        amountCents: donation.amountCents,
        checkoutKey: input.checkoutKey,
        successUrl: resultUrl(donation.id, 'success'),
        cancelUrl: resultUrl(donation.id, 'cancel'),
        email,
      }),
    );
    if (donation.providerCheckoutId !== checkout.checkoutId) {
      await prisma.donation.update({
        where: { id: donation.id },
        data: { providerCheckoutId: checkout.checkoutId },
      });
    }
    return { donationId: donation.id, redirectUrl: checkout.redirectUrl };
  } catch (err) {
    // Nothing was charged: forget the attempt so it does not show as pending.
    if (donation.providerCheckoutId === null)
      await prisma.donation.deleteMany({ where: { id: donation.id, status: 'PENDING' } });
    throw err;
  }
}

async function startMonthly(
  userId: string,
  email: string | null,
  input: DonationStartInput,
  gateway: PaymentGateway,
): Promise<DonationStartResultDto> {
  const amountCents = toCents(input.amount);
  const sameKey = await prisma.donationSubscription.findUnique({
    where: { userId_checkoutKey: { userId, checkoutKey: input.checkoutKey } },
  });
  const active = await prisma.donationSubscription.findFirst({
    where: { userId, status: { in: ['ACTIVE', 'PAST_DUE'] } },
  });
  if (active !== null) {
    if (sameKey?.id === active.id)
      return { donationId: active.id, redirectUrl: resultUrl(active.id, 'success') };
    throw new HttpError(409, 'ACTIVE_SUBSCRIPTION_EXISTS');
  }

  // A new attempt replaces abandoned checkouts (analysis I1): they no longer block anything.
  const abandoned = await prisma.donationSubscription.findMany({
    where: { userId, status: 'PENDING', NOT: { checkoutKey: input.checkoutKey } },
  });
  for (const old of abandoned) {
    await prisma.donationSubscription.update({
      where: { id: old.id },
      data: { status: 'CANCELED', canceledAt: new Date() },
    });
    if (old.providerCheckoutId !== null) {
      const checkoutId = old.providerCheckoutId;
      await getGateway(old.provider)
        ?.expireCheckout(checkoutId, 'MONTHLY')
        .catch((err: unknown) => {
          logger.warn({ err, subscriptionId: old.id }, 'could not expire abandoned checkout');
        });
    }
  }

  const sub =
    sameKey ??
    (await prisma.donationSubscription.create({
      data: { userId, provider: input.provider, amountCents, checkoutKey: input.checkoutKey },
    }));
  if (sub.status !== 'PENDING')
    return { donationId: sub.id, redirectUrl: resultUrl(sub.id, 'success') };
  try {
    const checkout = await withProvider(() =>
      gateway.createSubscriptionCheckout({
        id: sub.id,
        amountCents: sub.amountCents,
        checkoutKey: input.checkoutKey,
        successUrl: resultUrl(sub.id, 'success'),
        cancelUrl: resultUrl(sub.id, 'cancel'),
        email,
      }),
    );
    const data: Prisma.DonationSubscriptionUpdateInput = {
      providerCheckoutId: checkout.checkoutId,
    };
    if (checkout.providerSubscriptionId !== undefined)
      data.providerSubscriptionId = checkout.providerSubscriptionId;
    await prisma.donationSubscription.update({ where: { id: sub.id }, data });
    return { donationId: sub.id, redirectUrl: checkout.redirectUrl };
  } catch (err) {
    if (sub.providerCheckoutId === null)
      await prisma.donationSubscription.deleteMany({ where: { id: sub.id, status: 'PENDING' } });
    throw err;
  }
}

/** Status of a started donation for the result screen (research R7). */
export async function getDonationResult(
  userId: string,
  id: string,
  now = new Date(),
): Promise<DonationResultDto> {
  const adFreeUntil = await adFreeUntilOf(userId, now);
  const donation = await prisma.donation.findFirst({ where: { id, userId, kind: 'ONE_TIME' } });
  if (donation !== null) {
    const status =
      donation.status === 'PENDING' && isStalePending(donation.createdAt, now)
        ? 'CANCELED'
        : donation.status;
    return {
      id,
      kind: 'ONE_TIME',
      status,
      amount: donation.amountCents / 100,
      provider: donation.provider,
      adFreeUntil,
    };
  }
  const sub = await prisma.donationSubscription.findFirst({ where: { id, userId } });
  if (sub === null) throw notFound();
  const charged = await prisma.donation.count({
    where: { subscriptionId: sub.id, status: 'CONFIRMED' },
  });
  const status =
    charged > 0
      ? 'CONFIRMED'
      : sub.status === 'PENDING' && !isStalePending(sub.createdAt, now)
        ? 'PENDING'
        : sub.status === 'PENDING' || sub.status === 'CANCELED'
          ? 'CANCELED'
          : 'PENDING';
  return {
    id,
    kind: 'MONTHLY',
    status,
    amount: sub.amountCents / 100,
    provider: sub.provider,
    adFreeUntil,
  };
}

/** PayPal return page: capture the approved order (confirmation still comes by webhook, research R3). */
export async function handlePayPalReturn(userId: string, id: string): Promise<DonationResultDto> {
  const donation = await prisma.donation.findFirst({
    where: { id, userId, kind: 'ONE_TIME', provider: 'PAYPAL' },
  });
  if (donation?.status === 'PENDING' && donation.providerCheckoutId !== null) {
    const orderId = donation.providerCheckoutId;
    await getGateway('PAYPAL')
      ?.captureOrder(orderId)
      .catch((err: unknown) => {
        logger.warn({ err, donationId: id }, 'PayPal capture on return failed');
      });
  }
  return getDonationResult(userId, id);
}

export async function cancelSubscription(userId: string): Promise<SubscriptionDto> {
  const sub = await prisma.donationSubscription.findFirst({
    where: { userId, status: { in: ['ACTIVE', 'PAST_DUE'] } },
  });
  if (sub === null) throw notFound();
  if (sub.providerSubscriptionId !== null) {
    const providerSubscriptionId = sub.providerSubscriptionId;
    const gateway = getGateway(sub.provider);
    if (gateway === null) throw providerUnavailable();
    await withProvider(() => gateway.cancelSubscription(providerSubscriptionId));
  }
  // No more charges; the benefit lasts until the paid period ends (FR-014b).
  const canceled = await prisma.donationSubscription.update({
    where: { id: sub.id },
    data: { status: 'CANCELED', canceledAt: new Date(), nextChargeAt: null },
  });
  return subscriptionDto(canceled);
}

/** Link to update the card of a monthly donation (FR-014c); 404 for PayPal. */
export async function getManageLink(userId: string): Promise<{ url: string }> {
  const sub = await prisma.donationSubscription.findFirst({
    where: { userId, status: { in: ['ACTIVE', 'PAST_DUE'] } },
  });
  if (sub?.providerSubscriptionId === null || sub === null) throw notFound();
  const providerSubscriptionId = sub.providerSubscriptionId;
  const gateway = getGateway(sub.provider);
  if (gateway === null) throw providerUnavailable();
  const url = await withProvider(() =>
    gateway.createManageLink(providerSubscriptionId, `${env.APP_URL}/support/history`),
  );
  if (url === null) throw notFound();
  return { url };
}

export async function getDonationHistory(
  userId: string,
  now = new Date(),
): Promise<DonationHistoryDto> {
  const donations = await prisma.donation.findMany({
    where: {
      userId,
      OR: [
        { status: { in: ['CONFIRMED', 'REFUNDED', 'DISPUTED'] } },
        // Recent pending payments show as "Confirmando tu pago…" (analysis U2).
        {
          status: 'PENDING',
          providerCheckoutId: { not: null },
          createdAt: { gt: new Date(now.getTime() - PENDING_TTL_MS) },
        },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const sub = await currentSubscription(userId, now);
  return {
    items: donations.map((d) => ({
      id: d.id,
      kind: d.kind,
      provider: d.provider,
      amount: d.amountCents / 100,
      currency: d.currency,
      status: d.status,
      createdAt: d.createdAt.toISOString(),
      confirmedAt: iso(d.confirmedAt),
    })),
    subscription: sub === null ? null : subscriptionDto(sub),
    adFreeUntil: await adFreeUntilOf(userId, now),
    supportEmail: env.SUPPORT_EMAIL ?? null,
  };
}

export async function dismissDonationCard(userId: string): Promise<void> {
  await prisma.profile.update({
    where: { id: userId },
    data: { donationCardDismissedAt: new Date() },
  });
}
