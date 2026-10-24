import { DAY_MS, toCalendarDate } from '../maintenance/dates';

export const DIGEST_HOUR = 9;
export const DEFAULT_TIME_ZONE = 'America/Mexico_City';

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(timeZone);
  if (f === undefined) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatters.set(timeZone, f);
  }
  return f;
}

/** Offset (ms) of a time zone at an instant: local wall time − UTC. */
function offsetMs(instant: number, timeZone: string): number {
  const parts = Object.fromEntries(
    partsFormatter(timeZone)
      .formatToParts(instant)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** UTC instant of a local wall time in a time zone (handles DST transitions). */
export function zonedTimeToUtc(date: string, hour: number, timeZone: string): Date {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, hour);
  let utc = wall - offsetMs(wall, timeZone);
  // Re-evaluate once with the offset at the candidate instant (DST edges).
  utc = wall - offsetMs(utc, timeZone);
  return new Date(utc);
}

/** Calendar date YYYY-MM-DD of an instant in a time zone. */
export const localDate = (timeZone: string, instant: Date): string => toCalendarDate(instant, timeZone);

/** Next instant at `hour`:00 local time strictly after `now` (research R6). */
export function nextDigestAt(timeZone: string, now: Date, hour: number = DIGEST_HOUR): Date {
  const today = localDate(timeZone, now);
  const candidate = zonedTimeToUtc(today, hour, timeZone);
  if (candidate.getTime() > now.getTime()) return candidate;
  const tomorrow = localDate(timeZone, new Date(candidate.getTime() + DAY_MS + 3 * 60 * 60 * 1000));
  return zonedTimeToUtc(tomorrow, hour, timeZone);
}
