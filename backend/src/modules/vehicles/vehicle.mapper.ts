import type { VehicleDto } from '@car-checkup/shared/dto';
import type { Vehicle } from '@car-checkup/shared/prisma';

export type VehicleWithReviewCount = Vehicle & { _count: { readings: number } };

/** Prisma include that counts readings awaiting review (no N+1, research R7). */
export const pendingReviewCountInclude = {
  _count: { select: { readings: { where: { reviewStatus: 'NEEDS_REVIEW' as const } } } },
};

export function toVehicleDto(vehicle: VehicleWithReviewCount): VehicleDto {
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
  };
}
