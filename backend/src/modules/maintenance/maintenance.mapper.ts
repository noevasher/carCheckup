import type {
  MaintenanceItemDto,
  PaceDto,
  VehicleMaintenanceDto,
  VehicleMaintenanceSummaryDto,
} from '@car-checkup/shared/dto';
import {
  type CatalogEntry,
  compareUrgency,
  DEFAULT_PACE,
  DEFAULT_PACE_BY_USAGE,
  deriveStatus,
  isApplicable,
  isSnoozed,
  type MaintenanceStatus,
  resolveInterval,
  summarize,
} from '@car-checkup/shared/maintenance';
import type { MaintenanceEstimate, Vehicle, VehicleMaintenanceSetting } from '@car-checkup/shared/prisma';
import type { Clock } from '../../lib/clock';
import type { Tx } from '../../lib/prisma';
import { loadCatalog } from './recompute';

const isoDate = (d: Date | null): string | null => (d === null ? null : d.toISOString().slice(0, 10));
const iso = (d: Date | null): string | null => (d === null ? null : d.toISOString());

function paceOf(estimates: readonly MaintenanceEstimate[], vehicle: Pick<Vehicle, 'usageType'>): PaceDto {
  const first = estimates[0];
  if (first !== undefined) {
    return {
      kmPerDay: first.paceKmPerDay.toNumber(),
      source: first.paceSource,
      usageType: first.paceUsageType,
      windowDays: first.paceWindowDays,
    };
  }
  const usageType = vehicle.usageType;
  return {
    kmPerDay: usageType === null ? DEFAULT_PACE : DEFAULT_PACE_BY_USAGE[usageType],
    source: 'USAGE_DEFAULT',
    usageType,
    windowDays: null,
  };
}

/** Full maintenance view of a vehicle (FR-003, FR-008, FR-009). */
export function toVehicleMaintenanceDto(input: {
  vehicle: Pick<Vehicle, 'id' | 'fuelType' | 'usageType' | 'currentOdometerKm'>;
  estimates: readonly MaintenanceEstimate[];
  settings: readonly VehicleMaintenanceSetting[];
  catalog: readonly CatalogEntry[];
  clock: Clock;
}): VehicleMaintenanceDto {
  const { vehicle, estimates, settings, catalog, clock } = input;
  const estimateByType = new Map(estimates.map((e) => [e.typeCode, e]));
  const settingByType = new Map(settings.map((s) => [s.typeCode, s]));

  const items = catalog
    .filter((entry) => isApplicable(entry, vehicle.fuelType))
    .map((entry): MaintenanceItemDto => {
      const setting = settingByType.get(entry.code) ?? null;
      const estimate = estimateByType.get(entry.code);
      if (setting?.enabled === false || estimate === undefined) {
        return {
          typeCode: entry.code,
          sortOrder: entry.sortOrder,
          enabled: false,
          status: null,
          snoozedUntil: null,
          snoozed: false,
          askHistory: false,
          interval: resolveInterval(entry, setting, vehicle.usageType),
          baseline: null,
          dueKm: null,
          remainingKm: null,
          dueByTimeAt: null,
          estimatedDueAt: null,
          limitingFactor: null,
        };
      }
      const snoozedUntil = isoDate(setting?.snoozedUntil ?? null);
      return {
        typeCode: entry.code,
        sortOrder: entry.sortOrder,
        enabled: true,
        status: deriveStatus(estimate, vehicle.currentOdometerKm, clock.today, clock.timeZone),
        snoozedUntil,
        snoozed: isSnoozed(snoozedUntil, clock.today),
        askHistory: estimate.baselineSource === 'VEHICLE_REGISTRATION' && setting?.priorUnknown !== true,
        interval: {
          km: estimate.intervalKm,
          months: estimate.intervalMonths,
          source: estimate.intervalSource,
          defaultKm: entry.intervalKm,
          defaultMonths: entry.intervalMonths,
        },
        baseline: { source: estimate.baselineSource, km: estimate.baselineKm, at: estimate.baselineAt.toISOString() },
        dueKm: estimate.dueKm,
        remainingKm: estimate.dueKm === null ? null : estimate.dueKm - vehicle.currentOdometerKm,
        dueByTimeAt: iso(estimate.dueByTimeAt),
        estimatedDueAt: iso(estimate.estimatedDueAt),
        limitingFactor: estimate.limitingFactor,
      };
    })
    .sort(compareUrgency);

  return {
    vehicleId: vehicle.id,
    currentOdometerKm: vehicle.currentOdometerKm,
    pace: paceOf(estimates, vehicle),
    items,
  };
}

/** Loads and maps the maintenance view of one vehicle. */
export async function loadVehicleMaintenance(
  db: Tx,
  vehicleId: string,
  clock: Clock,
): Promise<VehicleMaintenanceDto> {
  const [vehicle, estimates, settings, catalog] = await Promise.all([
    db.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
      select: { id: true, fuelType: true, usageType: true, currentOdometerKm: true },
    }),
    db.maintenanceEstimate.findMany({ where: { vehicleId } }),
    db.vehicleMaintenanceSetting.findMany({ where: { vehicleId } }),
    loadCatalog(db),
  ]);
  return toVehicleMaintenanceDto({ vehicle, estimates, settings, catalog, clock });
}

export const EMPTY_SUMMARY: VehicleMaintenanceSummaryDto = { overdueCount: 0, upcomingCount: 0 };

/** Selector badge counts for many vehicles with two queries (FR-007b, no N+1). */
export async function loadSummaries(
  db: Tx,
  vehicles: readonly Pick<Vehicle, 'id' | 'currentOdometerKm'>[],
  clock: Clock,
): Promise<Map<string, VehicleMaintenanceSummaryDto>> {
  const ids = vehicles.map((v) => v.id);
  if (ids.length === 0) return new Map();
  const [estimates, snoozes] = await Promise.all([
    db.maintenanceEstimate.findMany({
      where: { vehicleId: { in: ids } },
      select: { vehicleId: true, typeCode: true, dueKm: true, dueByTimeAt: true, estimatedDueAt: true },
    }),
    db.vehicleMaintenanceSetting.findMany({
      where: { vehicleId: { in: ids }, snoozedUntil: { not: null } },
      select: { vehicleId: true, typeCode: true, snoozedUntil: true },
    }),
  ]);
  const snoozedKeys = new Set(
    snoozes
      .filter((s) => isSnoozed(s.snoozedUntil, clock.today))
      .map((s) => `${s.vehicleId}:${s.typeCode}`),
  );
  const kmById = new Map(vehicles.map((v) => [v.id, v.currentOdometerKm]));
  const byVehicle = new Map<string, { status: MaintenanceStatus; snoozed: boolean }[]>();
  for (const e of estimates) {
    const list = byVehicle.get(e.vehicleId) ?? [];
    list.push({
      status: deriveStatus(e, kmById.get(e.vehicleId) ?? 0, clock.today, clock.timeZone),
      snoozed: snoozedKeys.has(`${e.vehicleId}:${e.typeCode}`),
    });
    byVehicle.set(e.vehicleId, list);
  }
  return new Map(ids.map((id) => [id, summarize(byVehicle.get(id) ?? [])]));
}
