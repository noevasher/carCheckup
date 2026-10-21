/** Date helpers. A "calendar date" is a `YYYY-MM-DD` string in the user's time zone. */
export const DAY_MS = 86_400_000;

export const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * DAY_MS);

/** Adds calendar months in UTC, clamping to the last day of the target month. */
export function addMonths(d: Date, months: number): Date {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, d.getUTCHours(), d.getUTCMinutes()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return target;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (f === undefined) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Calendar date of an instant in a time zone. */
export const toCalendarDate = (instant: Date | string, timeZone: string): string =>
  formatter(timeZone).format(typeof instant === 'string' ? new Date(instant) : instant);

/** Today's calendar date in an IANA time zone (research R7). */
export const todayInTimeZone = (timeZone: string, now: Date = new Date()): string =>
  toCalendarDate(now, timeZone);

/** Whole days from calendar date `a` to `b` (positive when b is later). */
export function daysBetweenCalendarDates(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** Calendar date (DB `date` column, UTC midnight) as a stable instant at 12:00 UTC. */
export const calendarDateToNoonUtc = (d: Date | string): Date => {
  const iso = typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);
  return new Date(`${iso}T12:00:00Z`);
};

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
