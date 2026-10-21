import type { MaintenanceTypeCode } from '@car-checkup/shared/dto';
import { type CatalogEntry, estimateMaintenance } from '@car-checkup/shared/maintenance';
import type { Tx } from '../../lib/prisma';

let catalogCache: CatalogEntry[] | null = null;

/** Maintenance catalog (seeded by migration); cached per process. */
export async function loadCatalog(db: Tx): Promise<CatalogEntry[]> {
  catalogCache ??= await db.maintenanceType.findMany({ orderBy: { sortOrder: 'asc' } });
  return catalogCache;
}

/**
 * Re-runs the engine for one vehicle and replaces its persisted estimates (research R2).
 * Must run inside the transaction that changed readings, services, settings or the vehicle.
 */
export async function recomputeVehicleMaintenance(tx: Tx, vehicleId: string): Promise<void> {
  const [vehicle, readings, settings, catalog, services] = await Promise.all([
    tx.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
      select: { fuelType: true, usageType: true, currentOdometerKm: true, lastReadingAt: true },
    }),
    tx.mileageReading.findMany({
      where: { vehicleId, reviewStatus: 'OK' },
      orderBy: [{ readAt: 'asc' }, { id: 'asc' }],
      select: { odometerKm: true, readAt: true, source: true },
    }),
    tx.vehicleMaintenanceSetting.findMany({ where: { vehicleId } }),
    loadCatalog(tx),
    tx.$queryRaw<{ typeCode: MaintenanceTypeCode; odometerKm: number; performedAt: Date }[]>`
      SELECT DISTINCT ON (i.type_code)
             i.type_code::text AS "typeCode", s.odometer_km AS "odometerKm", s.performed_at AS "performedAt"
      FROM service_record_items i
      JOIN service_records s ON s.id = i.service_record_id
      WHERE s.vehicle_id = ${vehicleId}::uuid
      ORDER BY i.type_code, s.performed_at DESC, s.id DESC`,
  ]);

  await tx.maintenanceEstimate.deleteMany({ where: { vehicleId } });
  const initialReading = readings.find((r) => r.source === 'INITIAL') ?? readings[0];
  if (initialReading === undefined) return;

  const estimates = estimateMaintenance({
    catalog,
    settings,
    latestServiceByType: new Map(services.map((s) => [s.typeCode, s])),
    readings,
    initialReading,
    vehicle,
  });
  const computedAt = new Date();
  await tx.maintenanceEstimate.createMany({
    data: estimates.map((e) => ({
      vehicleId,
      typeCode: e.typeCode,
      baselineSource: e.baseline.source,
      baselineKm: e.baseline.km,
      baselineAt: e.baseline.at,
      intervalKm: e.interval.km,
      intervalMonths: e.interval.months,
      intervalSource: e.interval.source,
      dueKm: e.dueKm,
      dueByTimeAt: e.dueByTimeAt,
      paceKmPerDay: e.pace.kmPerDay,
      paceSource: e.pace.source,
      paceUsageType: e.pace.usageType,
      paceWindowDays: e.pace.windowDays,
      estimatedByKmAt: e.estimatedByKmAt,
      estimatedDueAt: e.estimatedDueAt,
      limitingFactor: e.limitingFactor,
      computedAt,
    })),
  });
}
