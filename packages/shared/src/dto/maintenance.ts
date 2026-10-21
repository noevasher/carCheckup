import type {
  BaselineSource,
  IntervalSource,
  LimitingFactor,
  MaintenanceTypeCode,
  PaceSource,
  UsageType,
} from '../generated/prisma/enums';
import type { MaintenanceEstimate, ServiceRecord } from '../generated/prisma/browser';
import type { Serialized } from './serialized';
import type { VehicleDto } from './vehicle';

export type MaintenanceStatusDto = 'OVERDUE' | 'UPCOMING' | 'OK';

export interface VehicleMaintenanceSummaryDto {
  overdueCount: number;
  upcomingCount: number;
}

export interface PaceDto {
  kmPerDay: number;
  source: PaceSource;
  usageType: UsageType | null;
  windowDays: number | null;
}

type EstimateDates = Serialized<Pick<MaintenanceEstimate, 'dueKm' | 'dueByTimeAt' | 'estimatedDueAt'>>;

export interface MaintenanceItemDto extends EstimateDates {
  typeCode: MaintenanceTypeCode;
  sortOrder: number;
  enabled: boolean;
  /** null when disabled. */
  status: MaintenanceStatusDto | null;
  snoozedUntil: string | null;
  snoozed: boolean;
  askHistory: boolean;
  interval: {
    km: number | null;
    months: number | null;
    source: IntervalSource;
    defaultKm: number | null;
    defaultMonths: number | null;
  };
  baseline: { source: BaselineSource; km: number; at: string } | null;
  remainingKm: number | null;
  limitingFactor: LimitingFactor | null;
}

export interface VehicleMaintenanceDto {
  vehicleId: string;
  currentOdometerKm: number;
  pace: PaceDto;
  items: MaintenanceItemDto[];
}

export type ServiceRecordDto = Serialized<
  Pick<ServiceRecord, 'id' | 'vehicleId' | 'performedAt' | 'odometerKm' | 'notes' | 'createdAt'>
> & {
  typeCodes: MaintenanceTypeCode[];
  createdReading: boolean;
};

export interface ServiceResultDto {
  service: ServiceRecordDto;
  vehicle: VehicleDto;
  maintenance: VehicleMaintenanceDto;
}

export interface ServicePageDto {
  items: ServiceRecordDto[];
  nextCursor: string | null;
}
