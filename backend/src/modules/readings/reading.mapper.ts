import type { MileageReadingDto } from '@car-checkup/shared/dto';
import type { MileageReading } from '@car-checkup/shared/prisma';

export function toReadingDto(r: MileageReading): MileageReadingDto {
  return {
    id: r.id,
    vehicleId: r.vehicleId,
    odometerKm: r.odometerKm,
    readAt: r.readAt.toISOString(),
    source: r.source,
    origin: r.origin,
    reviewStatus: r.reviewStatus,
    createdAt: r.createdAt.toISOString(),
  };
}
