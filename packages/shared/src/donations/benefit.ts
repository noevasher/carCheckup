const DAY_MS = 86_400_000;

/** A confirmed, non-refunded one-time donation: `days` ad-free from its confirmation. */
export interface BenefitGrant {
  at: Date;
  days: number;
}

/** Time covered by a confirmed, non-refunded monthly charge: [start, end). */
export interface BenefitPeriod {
  start: Date;
  end: Date;
}

/**
 * End of the ad-free benefit (FR-013, FR-014a, research R5), or null when none is active.
 * Monthly periods count as they are. One-time grants are applied in order, each starting at the
 * later of its date and the end of the previous grant, and their days are "saved" while a
 * monthly period covers them (clarification Q2): they only run on days no period covers.
 */
export function computeAdFreeUntil({
  grants,
  periods,
  now,
}: {
  grants: readonly BenefitGrant[];
  periods: readonly BenefitPeriod[];
  now: Date;
}): Date | null {
  const sortedPeriods = [...periods]
    .filter((p) => p.end > p.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const sortedGrants = [...grants]
    .filter((g) => g.days > 0)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  let grantsEnd = 0;
  for (const grant of sortedGrants) {
    let cursor = Math.max(grant.at.getTime(), grantsEnd);
    let remaining = grant.days * DAY_MS;
    for (const period of sortedPeriods) {
      const start = period.start.getTime();
      const end = period.end.getTime();
      if (end <= cursor) continue;
      if (start > cursor) {
        const used = Math.min(start - cursor, remaining);
        cursor += used;
        remaining -= used;
        if (remaining === 0) break;
      }
      cursor = Math.max(cursor, end);
    }
    grantsEnd = cursor + remaining;
  }

  const periodsEnd = sortedPeriods.reduce((max, p) => Math.max(max, p.end.getTime()), 0);
  const until = Math.max(grantsEnd, periodsEnd);
  return until > now.getTime() ? new Date(until) : null;
}
