import type { PaceSource, UsageType } from '../generated/prisma/enums';
import { DEFAULT_PACE, DEFAULT_PACE_BY_USAGE, PACE_MIN_SPAN_DAYS, PACE_WINDOW_DAYS } from './catalog';
import { DAY_MS } from './dates';

export interface ReadingInput {
  odometerKm: number;
  readAt: Date;
}

export interface Pace {
  kmPerDay: number;
  source: PaceSource;
  /** Usage used for the default pace (USAGE_DEFAULT only). */
  usageType: UsageType | null;
  /** Days covered by the readings used (READINGS only). */
  windowDays: number | null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

function spanPace(readings: readonly ReadingInput[]): Pace | null {
  const first = readings[0];
  const last = readings.at(-1);
  if (first === undefined || last === undefined || readings.length < 2) return null;
  const days = (last.readAt.getTime() - first.readAt.getTime()) / DAY_MS;
  if (days < PACE_MIN_SPAN_DAYS) return null;
  return {
    kmPerDay: round2(Math.max(0, (last.odometerKm - first.odometerKm) / days)),
    source: 'READINGS',
    usageType: null,
    windowDays: Math.round(days),
  };
}

/**
 * Usage pace (FR-005, research R4): last 90 days of valid readings → all valid readings →
 * average by declared usage (city 30, highway 60, mixed/unknown 40 km/day).
 * `readings` must be OK readings sorted by readAt ascending.
 */
export function computePace(readings: readonly ReadingInput[], usageType: UsageType | null): Pace {
  const last = readings.at(-1);
  if (last !== undefined) {
    const from = last.readAt.getTime() - PACE_WINDOW_DAYS * DAY_MS;
    const recent = spanPace(readings.filter((r) => r.readAt.getTime() >= from));
    if (recent !== null) return recent;
    const all = spanPace(readings);
    if (all !== null) return all;
  }
  return {
    kmPerDay: usageType === null ? DEFAULT_PACE : DEFAULT_PACE_BY_USAGE[usageType],
    source: 'USAGE_DEFAULT',
    usageType,
    windowDays: null,
  };
}
