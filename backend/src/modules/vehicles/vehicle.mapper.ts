import type { VehicleDto, VehicleMaintenanceSummaryDto } from '@car-checkup/shared/dto';
import type { Vehicle } from '@car-checkup/shared/prisma';
import type { Clock } from '../../lib/clock';
import type { Tx } from '../../lib/prisma';
import { EMPTY_SUMMARY, loadSummaries } from '../maintenance/maintenance.mapper';

export type VehicleWithReviewCount = Vehicle & { _count: { readings: number } };

/** Prisma include that counts readings awaiting review (no N+1, research R7). */
export const pendingReviewCountInclude = {
  _count: { select: { readings: { where: { reviewStatus: 'NEEDS_REVIEW' as const } } } },
};

export function toVehicleDto(
  vehicle: VehicleWithReviewCount,
  maintenance: VehicleMaintenanceSummaryDto,
): VehicleDto {
  return {
    id: vehicle.id,
    make: vehicle.make,
    model: vehicle.model,
    catalogModelId: vehicle.catalogModelId,
    year: vehicle.year,
    nickname: vehicle.nickname,
    licensePlate: vehicle.licensePlate,
    fuelType: vehicle.fuelType,
    usageType: vehicle.usageType,
    currentOdometerKm: vehicle.currentOdometerKm,
    lastReadingAt: vehicle.lastReadingAt.toISOString(),
    createdAt: vehicle.createdAt.toISOString(),
    pendingReviewCount: vehicle._count.readings,
    maintenance,
  };
}

/** Vehicle DTOs with their maintenance badge counts (two extra queries in total). */
export async function toVehicleDtos(
  db: Tx,
  vehicles: readonly VehicleWithReviewCount[],
  clock: Clock,
): Promise<VehicleDto[]> {
  const summaries = await loadSummaries(db, vehicles, clock);
  return vehicles.map((v) => toVehicleDto(v, summaries.get(v.id) ?? EMPTY_SUMMARY));
}

export async function toVehicleDtoWithSummary(
  db: Tx,
  vehicle: VehicleWithReviewCount,
  clock: Clock,
): Promise<VehicleDto> {
  const [dto] = await toVehicleDtos(db, [vehicle], clock);
  if (dto === undefined) throw new Error('unreachable');
  return dto;
}
