import type { ReviewStatus } from '../generated/prisma/enums';
import type { ValidRange } from '../errors';

/** Minimal shape needed to validate a reading against its neighbors. */
export interface ReadingPoint {
  id: string;
  odometerKm: number;
  readAt: Date | string;
  reviewStatus: ReviewStatus;
}

export interface Neighbors<T extends ReadingPoint> {
  prev: T | null;
  next: T | null;
}

export const DEFAULT_UNUSUAL_KM_PER_DAY = 1500;
export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const time = (d: Date | string): number => (typeof d === 'string' ? Date.parse(d) : d.getTime());

/**
 * Immediate previous/next OK readings around `readAt` (NEEDS_REVIEW readings are ignored).
 * A reading at exactly the same instant counts as previous.
 */
export function findNeighbors<T extends ReadingPoint>(
  readings: readonly T[],
  readAt: Date | string,
  excludeId?: string,
): Neighbors<T> {
  const target = time(readAt);
  let prev: T | null = null;
  let next: T | null = null;
  for (const r of readings) {
    if (r.reviewStatus !== 'OK' || r.id === excludeId) continue;
    const t = time(r.readAt);
    if (t <= target) {
      if (prev === null || t > time(prev.readAt)) prev = r;
    } else if (next === null || t < time(next.readAt)) {
      next = r;
    }
  }
  return { prev, next };
}

export type OrderCheck = { ok: true } | { ok: false; validRange: ValidRange };

/** prev.odometerKm ≤ odometerKm ≤ next.odometerKm (FR-008). */
export function checkOrder(
  odometerKm: number,
  prev: Pick<ReadingPoint, 'odometerKm'> | null,
  next: Pick<ReadingPoint, 'odometerKm'> | null,
): OrderCheck {
  const minKm = prev?.odometerKm ?? 0;
  const maxKm = next?.odometerKm ?? null;
  if (odometerKm < minKm || (maxKm !== null && odometerKm > maxKm)) {
    return { ok: false, validRange: { minKm, maxKm } };
  }
  return { ok: true };
}

/** (odometerKm − prev.odometerKm) / max(daysBetween, 1) > threshold (FR-009). */
export function isUnusual(
  odometerKm: number,
  prev: Pick<ReadingPoint, 'odometerKm' | 'readAt'> | null,
  readAt: Date | string,
  kmPerDayThreshold: number = DEFAULT_UNUSUAL_KM_PER_DAY,
): boolean {
  if (prev === null) return false;
  const days = Math.max((time(readAt) - time(prev.readAt)) / DAY_MS, 1);
  return (odometerKm - prev.odometerKm) / days > kmPerDayThreshold;
}

export function isFutureDate(readAt: Date | string, now: Date = new Date()): boolean {
  return time(readAt) > now.getTime() + FUTURE_TOLERANCE_MS;
}

/**
 * Parses user-typed kilometers: accepts thousand separators ("45.350", "45,350", "45 350")
 * and drops decimals ("45350,7" → 45350). Returns null when the text is not a number.
 */
export function parseKmInput(text: string): number | null {
  const compact = text.replace(/[\s'\u00a0\u202f]/g, '');
  const match = /^(\d{1,3}(?:([.,])\d{3})(?:\2\d{3})*|\d+)(?:[.,]\d+)?$/.exec(compact);
  const integerPart = match?.[1];
  if (integerPart === undefined) return null;
  const value = Number(integerPart.replace(/[.,]/g, ''));
  return Number.isSafeInteger(value) ? value : null;
}
