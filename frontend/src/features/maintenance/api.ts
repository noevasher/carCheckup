import type {
  MaintenanceTypeCode,
  VehicleMaintenanceDto,
  VehicleDto,
} from '@car-checkup/shared/dto';
import { compareUrgency, deriveStatus, isSnoozed, todayInTimeZone } from '@car-checkup/shared/maintenance';
import type { MaintenanceSettingUpdateInput } from '@car-checkup/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { vehiclesKey } from '../vehicles/api';

export const maintenanceKey = (vehicleId: string) => ['maintenance', vehicleId] as const;
export const userTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Status depends on "today": re-derive it on the device so a cached (possibly offline) response
 * stays correct as days pass (research R10).
 */
export function rederive(dto: VehicleMaintenanceDto): VehicleMaintenanceDto {
  const timeZone = userTimeZone();
  const today = todayInTimeZone(timeZone);
  const items = dto.items
    .map((item) =>
      item.enabled
        ? {
            ...item,
            status: deriveStatus(item, dto.currentOdometerKm, today, timeZone),
            snoozed: isSnoozed(item.snoozedUntil, today),
          }
        : item,
    )
    .sort(compareUrgency);
  return { ...dto, items };
}

export function useVehicleMaintenance(vehicleId: string) {
  return useQuery({
    queryKey: maintenanceKey(vehicleId),
    queryFn: ({ signal }) => apiFetch<VehicleMaintenanceDto>(`/v1/vehicles/${vehicleId}/maintenance`, { signal }),
    select: rederive,
  });
}

/** Applies a fresh maintenance view and vehicle (e.g. from a service result) to the cache. */
export function applyMaintenance(
  queryClient: ReturnType<typeof useQueryClient>,
  maintenance: VehicleMaintenanceDto,
): void {
  queryClient.setQueryData(maintenanceKey(maintenance.vehicleId), maintenance);
  void queryClient.invalidateQueries({ queryKey: vehiclesKey });
}

export function useUpdateMaintenanceSetting(vehicleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ typeCode, input }: { typeCode: MaintenanceTypeCode; input: MaintenanceSettingUpdateInput }) =>
      apiFetch<VehicleMaintenanceDto>(`/v1/vehicles/${vehicleId}/maintenance/${typeCode}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: (maintenance) => {
      applyMaintenance(queryClient, maintenance);
    },
  });
}

/** Maintenance depends on readings and vehicle data: refresh it after they change (FR-019). */
export function invalidateMaintenance(queryClient: ReturnType<typeof useQueryClient>, vehicle: Pick<VehicleDto, 'id'>): void {
  void queryClient.invalidateQueries({ queryKey: maintenanceKey(vehicle.id) });
}
