import type { MileageReading } from '../generated/prisma/browser';
import type { Serialized } from './serialized';
import type { VehicleDto } from './vehicle';

export type MileageReadingDto = Serialized<
  Pick<
    MileageReading,
    'id' | 'vehicleId' | 'odometerKm' | 'readAt' | 'source' | 'origin' | 'reviewStatus' | 'createdAt'
  >
>;

export interface ReadingResultDto {
  reading: MileageReadingDto;
  vehicle: VehicleDto;
}

export interface ReadingPageDto {
  items: MileageReadingDto[];
  nextCursor: string | null;
}
