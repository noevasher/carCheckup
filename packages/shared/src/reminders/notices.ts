import type { MaintenanceTypeCode, NoticeKind, NotifiedStatus } from '../generated/prisma/enums';
import { daysBetweenCalendarDates, toCalendarDate } from '../maintenance/dates';
import { deriveStatus } from '../maintenance/status';

/** Persisted estimate fields needed to decide notices (dates as Date or ISO string). */
export interface NoticeEstimate {
  typeCode: MaintenanceTypeCode;
  baselineSource: string;
  baselineKm: number;
  baselineAt: Date | string;
  intervalKm: number | null;
  intervalMonths: number | null;
  dueKm: number | null;
  dueByTimeAt: Date | string | null;
  estimatedDueAt: Date | string | null;
}

export interface NoticeState {
  typeCode: MaintenanceTypeCode;
  cycleSignature: string;
  lastNotifiedStatus: NotifiedStatus | null;
}

export interface NoticeDraft {
  kind: NoticeKind;
  typeCode: MaintenanceTypeCode | null;
  cycleKey: string;
  remainingKm: number | null;
  overdueDays: number | null;
  estimatedDueAt: Date | null;
}

const iso = (d: Date | string): string => (typeof d === 'string' ? new Date(d).toISOString() : d.toISOString());

/**
 * A cycle changes only when the starting point (service, prior history) or the interval changes;
 * a transient "Al día" with the same signature does not restart it (FR-003, research R7).
 */
export const cycleSignature = (e: NoticeEstimate): string =>
  [e.baselineSource, e.baselineKm, iso(e.baselineAt), e.intervalKm ?? '-', e.intervalMonths ?? '-'].join('|');

/** Maintenance notices for one vehicle (FR-002..FR-004). */
export function decideMaintenanceNotices(input: {
  estimates: readonly NoticeEstimate[];
  snoozedTypes: ReadonlySet<MaintenanceTypeCode>;
  states: readonly NoticeState[];
  currentOdometerKm: number;
  today: string;
  timeZone: string;
}): { notices: NoticeDraft[]; nextStates: NoticeState[] } {
  const { estimates, snoozedTypes, states, currentOdometerKm, today, timeZone } = input;
  const stateByType = new Map(states.map((s) => [s.typeCode, s]));
  const notices: NoticeDraft[] = [];
  const nextStates: NoticeState[] = [];

  for (const e of estimates) {
    const signature = cycleSignature(e);
    const previous = stateByType.get(e.typeCode);
    const notified = previous !== undefined && previous.cycleSignature === signature ? previous.lastNotifiedStatus : null;
    let lastNotifiedStatus = notified;

    if (!snoozedTypes.has(e.typeCode)) {
      const status = deriveStatus(e, currentOdometerKm, today, timeZone);
      const remainingKm = e.dueKm === null ? null : e.dueKm - currentOdometerKm;
      const dueByTime = e.dueByTimeAt === null ? null : toCalendarDate(e.dueByTimeAt, timeZone);
      const overdueDays = dueByTime !== null && dueByTime <= today ? daysBetweenCalendarDates(dueByTime, today) : null;
      const base = {
        typeCode: e.typeCode,
        cycleKey: signature,
        remainingKm,
        overdueDays,
        estimatedDueAt: e.estimatedDueAt === null ? null : new Date(e.estimatedDueAt),
      };
      if (status === 'OVERDUE' && notified !== 'OVERDUE') {
        notices.push({ kind: 'MAINTENANCE_OVERDUE', ...base });
        lastNotifiedStatus = 'OVERDUE';
      } else if (status === 'UPCOMING' && notified === null) {
        notices.push({ kind: 'MAINTENANCE_UPCOMING', ...base });
        lastNotifiedStatus = 'UPCOMING';
      }
    }
    nextStates.push({ typeCode: e.typeCode, cycleSignature: signature, lastNotifiedStatus });
  }
  return { notices, nextStates };
}

export const MILEAGE_REMINDER_DAYS = 30;

/**
 * Mileage reminder (FR-005): last valid reading ≥ 30 days old and no reminder in the last 30
 * days (or none since that reading).
 */
export function decideMileageNotice(input: {
  lastReadingAt: Date;
  lastKmReminderAt: Date | null;
  today: string;
  timeZone: string;
}): NoticeDraft | null {
  const { lastReadingAt, lastKmReminderAt, today, timeZone } = input;
  if (daysBetweenCalendarDates(toCalendarDate(lastReadingAt, timeZone), today) < MILEAGE_REMINDER_DAYS) return null;
  if (
    lastKmReminderAt !== null &&
    lastKmReminderAt > lastReadingAt &&
    daysBetweenCalendarDates(toCalendarDate(lastKmReminderAt, timeZone), today) < MILEAGE_REMINDER_DAYS
  ) {
    return null;
  }
  return { kind: 'MILEAGE_UPDATE', typeCode: null, cycleKey: today, remainingKm: null, overdueDays: null, estimatedDueAt: null };
}
