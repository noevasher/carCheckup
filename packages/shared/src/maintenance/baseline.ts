import type { BaselineSource } from '../generated/prisma/enums';
import { addDays, calendarDateToNoonUtc, DAY_MS } from './dates';
import type { ReadingInput } from './pace';

export interface PriorInput {
  priorKm: number | null;
  priorDate: Date | null;
  priorUnknown: boolean;
}

export interface Baseline {
  source: BaselineSource;
  km: number;
  at: Date;
}

/** Estimated odometer at a date: interpolate between readings, extrapolate with the pace. */
export function kmAtDate(readings: readonly ReadingInput[], at: Date, kmPerDay: number): number {
  const first = readings[0];
  const last = readings.at(-1);
  if (first === undefined || last === undefined) return 0;
  const t = at.getTime();
  if (t <= first.readAt.getTime()) {
    return Math.max(0, Math.round(first.odometerKm - (kmPerDay * (first.readAt.getTime() - t)) / DAY_MS));
  }
  if (t >= last.readAt.getTime()) {
    return Math.round(last.odometerKm + (kmPerDay * (t - last.readAt.getTime())) / DAY_MS);
  }
  for (let i = 1; i < readings.length; i += 1) {
    const a = readings[i - 1];
    const b = readings[i];
    if (a === undefined || b === undefined) continue;
    if (t <= b.readAt.getTime()) {
      const span = b.readAt.getTime() - a.readAt.getTime();
      const ratio = span === 0 ? 0 : (t - a.readAt.getTime()) / span;
      return Math.round(a.odometerKm + ratio * (b.odometerKm - a.odometerKm));
    }
  }
  return last.odometerKm;
}

/** Estimated date at which the vehicle had `km` (inverse of kmAtDate). */
export function dateAtKm(readings: readonly ReadingInput[], km: number, kmPerDay: number): Date {
  const first = readings[0];
  const last = readings.at(-1);
  if (first === undefined || last === undefined) return new Date();
  if (km <= first.odometerKm) {
    return kmPerDay > 0 ? addDays(first.readAt, -(first.odometerKm - km) / kmPerDay) : first.readAt;
  }
  if (km >= last.odometerKm) return last.readAt;
  for (let i = 1; i < readings.length; i += 1) {
    const a = readings[i - 1];
    const b = readings[i];
    if (a === undefined || b === undefined) continue;
    if (km <= b.odometerKm) {
      const delta = b.odometerKm - a.odometerKm;
      const ratio = delta === 0 ? 0 : (km - a.odometerKm) / delta;
      return new Date(a.readAt.getTime() + ratio * (b.readAt.getTime() - a.readAt.getTime()));
    }
  }
  return last.readAt;
}

/**
 * Starting point of a maintenance (FR-013, FR-015, FR-016, research R5):
 * latest service → prior history given by the user → vehicle registration in the app.
 */
export function resolveBaseline(input: {
  latestService: { odometerKm: number; performedAt: Date } | null;
  prior: PriorInput | null;
  initialReading: ReadingInput;
  readings: readonly ReadingInput[];
  kmPerDay: number;
}): Baseline {
  const { latestService, prior, initialReading, readings, kmPerDay } = input;
  if (latestService !== null) {
    return { source: 'SERVICE', km: latestService.odometerKm, at: latestService.performedAt };
  }
  if (prior !== null && !prior.priorUnknown && (prior.priorKm !== null || prior.priorDate !== null)) {
    const at = prior.priorDate !== null ? calendarDateToNoonUtc(prior.priorDate) : null;
    if (prior.priorKm !== null && at !== null) return { source: 'PRIOR', km: prior.priorKm, at };
    if (at !== null) return { source: 'PRIOR', km: kmAtDate(readings, at, kmPerDay), at };
    if (prior.priorKm !== null) {
      return { source: 'PRIOR', km: prior.priorKm, at: dateAtKm(readings, prior.priorKm, kmPerDay) };
    }
  }
  return { source: 'VEHICLE_REGISTRATION', km: initialReading.odometerKm, at: initialReading.readAt };
}
