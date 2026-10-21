import type {
  FuelType,
  LimitingFactor,
  MaintenanceTypeCode,
  UsageType,
} from '../generated/prisma/enums';
import { type Baseline, type PriorInput, resolveBaseline } from './baseline';
import type { CatalogEntry } from './catalog';
import { addDays, addMonths } from './dates';
import { type AppliedInterval, type IntervalSettingInput, resolveInterval } from './interval';
import { computePace, type Pace, type ReadingInput } from './pace';

export interface SettingInput extends IntervalSettingInput, PriorInput {
  typeCode: MaintenanceTypeCode;
  enabled: boolean;
  snoozedUntil: Date | null;
}

export interface VehicleInput {
  fuelType: FuelType | null;
  usageType: UsageType | null;
  currentOdometerKm: number;
  lastReadingAt: Date;
}

export interface EngineInput {
  catalog: readonly CatalogEntry[];
  settings: readonly SettingInput[];
  latestServiceByType: ReadonlyMap<MaintenanceTypeCode, { odometerKm: number; performedAt: Date }>;
  /** Valid (OK) readings sorted by readAt ascending. */
  readings: readonly ReadingInput[];
  initialReading: ReadingInput;
  vehicle: VehicleInput;
}

export interface Estimate {
  typeCode: MaintenanceTypeCode;
  baseline: Baseline;
  interval: AppliedInterval;
  pace: Pace;
  dueKm: number | null;
  dueByTimeAt: Date | null;
  estimatedByKmAt: Date | null;
  estimatedDueAt: Date | null;
  limitingFactor: LimitingFactor | null;
}

/** Whether a catalog item applies to a fuel type (unknown fuel → combustion-common items). */
export const isApplicable = (entry: CatalogEntry, fuelType: FuelType | null): boolean =>
  fuelType === null ? entry.appliesWhenFuelUnknown : entry.fuelTypes.includes(fuelType);

/**
 * Maintenance engine (FR-003..FR-006, FR-015, FR-017, research R4–R7). Pure: values here do not
 * depend on "today"; status is derived at read time (status.ts).
 */
export function estimateMaintenance(input: EngineInput): Estimate[] {
  const { catalog, settings, latestServiceByType, readings, initialReading, vehicle } = input;
  const pace = computePace(readings, vehicle.usageType);
  const settingByType = new Map(settings.map((s) => [s.typeCode, s]));

  return [...catalog]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((entry) => isApplicable(entry, vehicle.fuelType))
    .filter((entry) => settingByType.get(entry.code)?.enabled !== false)
    .map((entry): Estimate => {
      const setting = settingByType.get(entry.code) ?? null;
      const interval = resolveInterval(entry, setting, vehicle.usageType);
      const baseline = resolveBaseline({
        latestService: latestServiceByType.get(entry.code) ?? null,
        prior: setting,
        initialReading,
        readings,
        kmPerDay: pace.kmPerDay,
      });
      const dueKm = interval.km !== null ? baseline.km + interval.km : null;
      const dueByTimeAt = interval.months !== null ? addMonths(baseline.at, interval.months) : null;
      const estimatedByKmAt =
        dueKm !== null && pace.kmPerDay > 0
          ? addDays(vehicle.lastReadingAt, (dueKm - vehicle.currentOdometerKm) / pace.kmPerDay)
          : null;

      let estimatedDueAt: Date | null = null;
      let limitingFactor: LimitingFactor | null = null;
      if (estimatedByKmAt !== null && (dueByTimeAt === null || estimatedByKmAt <= dueByTimeAt)) {
        estimatedDueAt = estimatedByKmAt;
        limitingFactor = 'KM';
      } else if (dueByTimeAt !== null) {
        estimatedDueAt = dueByTimeAt;
        limitingFactor = 'TIME';
      }

      return { typeCode: entry.code, baseline, interval, pace, dueKm, dueByTimeAt, estimatedByKmAt, estimatedDueAt, limitingFactor };
    });
}
