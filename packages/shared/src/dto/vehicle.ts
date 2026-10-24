import type { Vehicle } from '../generated/prisma/browser';
import type { VehicleMaintenanceSummaryDto } from './maintenance';
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
    | 'emailReminders'
    | 'currentOdometerKm'
    | 'lastReadingAt'
    | 'createdAt'
  >
> & {
  /** Readings in NEEDS_REVIEW the user has to fix. */
  pendingReviewCount: number;
  /** Selector badge counts (feature 002, FR-007b). */
  maintenance: VehicleMaintenanceSummaryDto;
};

export interface VehicleListDto {
  items: VehicleDto[];
}
