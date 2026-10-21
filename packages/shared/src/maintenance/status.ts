import { UPCOMING_DAYS, UPCOMING_KM } from './catalog';
import { daysBetweenCalendarDates, toCalendarDate } from './dates';

export type MaintenanceStatus = 'OVERDUE' | 'UPCOMING' | 'OK';

/** Minimal persisted estimate needed to derive the status (Date or ISO string). */
export interface StatusInput {
  dueKm: number | null;
  dueByTimeAt: Date | string | null;
  estimatedDueAt: Date | string | null;
}

/**
 * Status at read time (FR-006, research R7): `today` is the user's calendar date (YYYY-MM-DD)
 * and instants are converted to calendar dates in the same time zone.
 */
export function deriveStatus(
  estimate: StatusInput,
  currentOdometerKm: number,
  today: string,
  timeZone: string,
): MaintenanceStatus {
  const remainingKm = estimate.dueKm === null ? null : estimate.dueKm - currentOdometerKm;
  const dueByTime = estimate.dueByTimeAt === null ? null : toCalendarDate(estimate.dueByTimeAt, timeZone);
  if ((remainingKm !== null && remainingKm <= 0) || (dueByTime !== null && dueByTime <= today)) {
    return 'OVERDUE';
  }
  const estimated = estimate.estimatedDueAt === null ? null : toCalendarDate(estimate.estimatedDueAt, timeZone);
  const withinDays = (date: string | null) =>
    date !== null && daysBetweenCalendarDates(today, date) <= UPCOMING_DAYS;
  if ((remainingKm !== null && remainingKm <= UPCOMING_KM) || withinDays(estimated) || withinDays(dueByTime)) {
    return 'UPCOMING';
  }
  return 'OK';
}

/** A snooze applies while its date is after today (FR-007a). */
export function isSnoozed(snoozedUntil: Date | string | null, today: string): boolean {
  if (snoozedUntil === null) return false;
  const until = typeof snoozedUntil === 'string' ? snoozedUntil.slice(0, 10) : snoozedUntil.toISOString().slice(0, 10);
  return until > today;
}

const rank: Record<MaintenanceStatus, number> = { OVERDUE: 0, UPCOMING: 1, OK: 2 };

/** Overdue first, then by estimated date (null last), then catalog order. */
export function compareUrgency(
  a: { status: MaintenanceStatus | null; estimatedDueAt: string | null; sortOrder: number },
  b: { status: MaintenanceStatus | null; estimatedDueAt: string | null; sortOrder: number },
): number {
  const ra = a.status === null ? 3 : rank[a.status];
  const rb = b.status === null ? 3 : rank[b.status];
  if (ra !== rb) return ra - rb;
  if (a.estimatedDueAt !== b.estimatedDueAt) {
    if (a.estimatedDueAt === null) return 1;
    if (b.estimatedDueAt === null) return -1;
    return a.estimatedDueAt.localeCompare(b.estimatedDueAt);
  }
  return a.sortOrder - b.sortOrder;
}

/** Selector badge counts (FR-007b): non-snoozed, enabled items only. */
export function summarize(
  items: readonly { status: MaintenanceStatus | null; snoozed: boolean }[],
): { overdueCount: number; upcomingCount: number } {
  let overdueCount = 0;
  let upcomingCount = 0;
  for (const item of items) {
    if (item.snoozed) continue;
    if (item.status === 'OVERDUE') overdueCount += 1;
    else if (item.status === 'UPCOMING') upcomingCount += 1;
  }
  return { overdueCount, upcomingCount };
}
