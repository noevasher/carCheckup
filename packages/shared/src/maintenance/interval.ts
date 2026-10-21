import type { IntervalSource, UsageType } from '../generated/prisma/enums';
import { CITY_FACTOR, type CatalogEntry } from './catalog';

export interface IntervalSettingInput {
  customIntervalKm: number | null;
  customIntervalMonths: number | null;
}

export interface AppliedInterval {
  km: number | null;
  months: number | null;
  source: IntervalSource;
  defaultKm: number | null;
  defaultMonths: number | null;
}

/**
 * Interval applied to a vehicle (FR-017, FR-018, research R6): a custom interval wins and is
 * never adjusted; otherwise severe-usage items lose 20 % of their km interval in city use.
 */
export function resolveInterval(
  entry: CatalogEntry,
  setting: IntervalSettingInput | null,
  usageType: UsageType | null,
): AppliedInterval {
  const defaults = { defaultKm: entry.intervalKm, defaultMonths: entry.intervalMonths };
  if (setting !== null && (setting.customIntervalKm !== null || setting.customIntervalMonths !== null)) {
    return {
      km: setting.customIntervalKm ?? entry.intervalKm,
      months: setting.customIntervalMonths ?? entry.intervalMonths,
      source: 'CUSTOM',
      ...defaults,
    };
  }
  if (entry.severeUsageSensitive && usageType === 'CITY' && entry.intervalKm !== null) {
    return {
      km: Math.round((entry.intervalKm * CITY_FACTOR) / 100) * 100,
      months: entry.intervalMonths,
      source: 'CITY_ADJUSTED',
      ...defaults,
    };
  }
  return { km: entry.intervalKm, months: entry.intervalMonths, source: 'DEFAULT', ...defaults };
}
