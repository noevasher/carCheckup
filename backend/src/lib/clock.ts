import { todayInTimeZone } from '@car-checkup/shared/maintenance';

/** "Today" for a request, in the user's time zone (research R7). */
export interface Clock {
  timeZone: string;
  /** Calendar date YYYY-MM-DD in `timeZone`. */
  today: string;
}

export const clockFor = (timeZone: string, now: Date = new Date()): Clock => ({
  timeZone,
  today: todayInTimeZone(timeZone, now),
});
