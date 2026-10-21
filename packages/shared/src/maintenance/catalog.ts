import type { FuelType, MaintenanceTypeCode, UsageType } from '../generated/prisma/enums';

/** Catalog entry as stored in `maintenance_types` (seeded by migration, research R3). */
export interface CatalogEntry {
  code: MaintenanceTypeCode;
  intervalKm: number | null;
  intervalMonths: number | null;
  fuelTypes: readonly FuelType[];
  appliesWhenFuelUnknown: boolean;
  severeUsageSensitive: boolean;
  sortOrder: number;
}

const ALL: readonly FuelType[] = ['GASOLINE', 'DIESEL', 'HYBRID', 'ELECTRIC'];
const COMBUSTION: readonly FuelType[] = ['GASOLINE', 'DIESEL', 'HYBRID'];

/** Typed mirror of the migration values; tests assert both stay equal. */
export const MAINTENANCE_DEFAULTS: readonly CatalogEntry[] = [
  { code: 'OIL_CHANGE', intervalKm: 10_000, intervalMonths: 12, fuelTypes: COMBUSTION, appliesWhenFuelUnknown: true, severeUsageSensitive: true, sortOrder: 10 },
  { code: 'ENGINE_AIR_FILTER', intervalKm: 20_000, intervalMonths: 24, fuelTypes: COMBUSTION, appliesWhenFuelUnknown: true, severeUsageSensitive: true, sortOrder: 20 },
  { code: 'CABIN_AIR_FILTER', intervalKm: 15_000, intervalMonths: 12, fuelTypes: ALL, appliesWhenFuelUnknown: true, severeUsageSensitive: true, sortOrder: 30 },
  { code: 'TIRE_ROTATION', intervalKm: 10_000, intervalMonths: 12, fuelTypes: ALL, appliesWhenFuelUnknown: true, severeUsageSensitive: false, sortOrder: 40 },
  { code: 'ALIGNMENT_BALANCING', intervalKm: 10_000, intervalMonths: 12, fuelTypes: ALL, appliesWhenFuelUnknown: true, severeUsageSensitive: false, sortOrder: 50 },
  { code: 'TIRE_REPLACEMENT', intervalKm: 50_000, intervalMonths: 72, fuelTypes: ALL, appliesWhenFuelUnknown: true, severeUsageSensitive: false, sortOrder: 60 },
  { code: 'BRAKE_INSPECTION', intervalKm: 20_000, intervalMonths: 12, fuelTypes: ALL, appliesWhenFuelUnknown: true, severeUsageSensitive: true, sortOrder: 70 },
  { code: 'BRAKE_FLUID', intervalKm: null, intervalMonths: 24, fuelTypes: ALL, appliesWhenFuelUnknown: true, severeUsageSensitive: false, sortOrder: 80 },
  { code: 'COOLANT', intervalKm: 60_000, intervalMonths: 48, fuelTypes: COMBUSTION, appliesWhenFuelUnknown: true, severeUsageSensitive: false, sortOrder: 90 },
  { code: 'SPARK_PLUGS', intervalKm: 40_000, intervalMonths: 48, fuelTypes: ['GASOLINE', 'HYBRID'], appliesWhenFuelUnknown: false, severeUsageSensitive: false, sortOrder: 100 },
  { code: 'TIMING_BELT', intervalKm: 100_000, intervalMonths: 72, fuelTypes: COMBUSTION, appliesWhenFuelUnknown: true, severeUsageSensitive: false, sortOrder: 110 },
  { code: 'TRANSMISSION_FLUID', intervalKm: 60_000, intervalMonths: 48, fuelTypes: COMBUSTION, appliesWhenFuelUnknown: true, severeUsageSensitive: false, sortOrder: 120 },
  { code: 'BATTERY_CHECK', intervalKm: null, intervalMonths: 12, fuelTypes: ALL, appliesWhenFuelUnknown: true, severeUsageSensitive: false, sortOrder: 130 },
];

export const UPCOMING_KM = 1000;
export const UPCOMING_DAYS = 30;
export const CITY_FACTOR = 0.8;
export const DEFAULT_PACE = 40;
export const DEFAULT_PACE_BY_USAGE: Readonly<Record<UsageType, number>> = { CITY: 30, HIGHWAY: 60, MIXED: 40 };
export const PACE_WINDOW_DAYS = 90;
export const PACE_MIN_SPAN_DAYS = 7;
export const SNOOZE_DAYS = 7;
