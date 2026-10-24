import { env } from '../../config/env';
import { getEmailSender } from '../../lib/email';
import { renderDonationThanksEmail } from '../../lib/email/templates';
import { prisma } from '../../lib/prisma';
import { logger } from '../../middleware/logging';

/**
 * Sends the thank-you email of a confirmed donation (FR-011, clarification Q1): also to users
 * who unsubscribed from reminders (it is a receipt), never to undeliverable addresses.
 * Errors are logged: they never affect the webhook response.
 */
export async function sendDonationThanks(donationId: string): Promise<void> {
  try {
    const donation = await prisma.donation.findUnique({
      where: { id: donationId },
      select: {
        kind: true,
        provider: true,
        amountCents: true,
        confirmedAt: true,
        status: true,
        user: { select: { email: true, emailStatus: true, timeZone: true, adFreeUntil: true } },
      },
    });
    const user = donation?.user;
    if (
      donation?.status !== 'CONFIRMED' ||
      donation.confirmedAt === null ||
      user === null ||
      user === undefined
    )
      return;
    if (user.email === null || user.emailStatus !== 'OK') return;
    const message = renderDonationThanksEmail({
      kind: donation.kind,
      provider: donation.provider,
      amountCents: donation.amountCents,
      confirmedAt: donation.confirmedAt,
      adFreeUntil: user.adFreeUntil,
      timeZone: user.timeZone,
      appUrl: env.APP_URL,
      supportEmail: env.SUPPORT_EMAIL ?? null,
    });
    await getEmailSender().send(
      { to: user.email, ...message },
      { idempotencyKey: `donation-thanks:${donationId}` },
    );
  } catch (err) {
    logger.error({ err, donationId }, 'donation thank-you email failed');
  }
}
