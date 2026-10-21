import type { Vehicle } from '../generated/prisma/browser';
import type { Serialized } from './serialized';

export type VehicleDto = Serialized<
  Pick<
    Vehicle,
    | 'id'
    | 'make'
    | 'model'
    | 'catalogModelId'
    | 'year'
    | 'nickname'
    | 'licensePlate'
    | 'fuelType'
    | 'usageType'
    | 'currentOdometerKm'
    | 'lastReadingAt'
    | 'createdAt'
  >
> & {
  /** Readings in NEEDS_REVIEW the user has to fix. */
  pendingReviewCount: number;
};

export interface VehicleListDto {
  items: VehicleDto[];
}
