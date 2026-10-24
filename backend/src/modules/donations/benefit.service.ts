import { computeAdFreeUntil } from '@car-checkup/shared/donations';
import type { Tx } from '../../lib/prisma';

/**
 * Recomputes and stores `profiles.adFreeUntil` from the user's confirmed donations (research R5).
 * Refunded or disputed donations no longer count (FR-014d). The ads feature only reads the result
 * and MUST NOT show ads while `adFreeUntil > now`.
 */
export async function recalculateAdFree(
  tx: Tx,
  userId: string,
  now: Date = new Date(),
): Promise<Date | null> {
  const donations = await tx.donation.findMany({
    where: { userId, status: 'CONFIRMED' },
    select: { kind: true, adFreeDays: true, confirmedAt: true, periodStart: true, periodEnd: true },
  });
  const grants = donations.flatMap((d) =>
    d.kind === 'ONE_TIME' && d.confirmedAt !== null
      ? [{ at: d.confirmedAt, days: d.adFreeDays }]
      : [],
  );
  const periods = donations.flatMap((d) =>
    d.kind === 'MONTHLY_CHARGE' && d.periodStart !== null && d.periodEnd !== null
      ? [{ start: d.periodStart, end: d.periodEnd }]
      : [],
  );
  const adFreeUntil = computeAdFreeUntil({ grants, periods, now });
  await tx.profile.update({ where: { id: userId }, data: { adFreeUntil } });
  return adFreeUntil;
}
