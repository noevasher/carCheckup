import type { ServicePageDto, ServiceResultDto, VehicleDto, VehicleMaintenanceDto } from '@car-checkup/shared/dto';
import type { ServiceCreateInput, ServiceUpdateInput } from '@car-checkup/shared/schemas';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { applyMaintenance } from '../maintenance/api';
import { replaceVehicleInCache } from '../vehicles/api';

const servicesKey = (vehicleId: string) => ['services', vehicleId] as const;

export function useServicesInfinite(vehicleId: string) {
  return useInfiniteQuery({
    queryKey: servicesKey(vehicleId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: '30' });
      if (pageParam !== null) params.set('cursor', pageParam);
      return apiFetch<ServicePageDto>(`/v1/vehicles/${vehicleId}/services?${params.toString()}`, { signal });
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}

function useApplyServiceResult(vehicleId: string) {
  const queryClient = useQueryClient();
  return (result: { vehicle: VehicleDto; maintenance: VehicleMaintenanceDto }) => {
    replaceVehicleInCache(queryClient, result.vehicle);
    applyMaintenance(queryClient, result.maintenance);
    void queryClient.invalidateQueries({ queryKey: servicesKey(vehicleId) });
    void queryClient.invalidateQueries({ queryKey: ['readings', vehicleId] });
  };
}

/** Wire format of ServiceCreateInput (`confirmedUnusual` optional, defaulted by the API). */
export type ServiceCreateBody = Omit<ServiceCreateInput, 'confirmedUnusual'> & { confirmedUnusual?: boolean };

export function useCreateService(vehicleId: string) {
  const apply = useApplyServiceResult(vehicleId);
  return useMutation({
    mutationFn: (input: ServiceCreateBody) =>
      apiFetch<ServiceResultDto>(`/v1/vehicles/${vehicleId}/services`, { method: 'POST', body: input }),
    onSuccess: apply,
  });
}

export function useUpdateService(vehicleId: string) {
  const apply = useApplyServiceResult(vehicleId);
  return useMutation({
    mutationFn: ({ serviceId, input }: { serviceId: string; input: ServiceUpdateInput }) =>
      apiFetch<ServiceResultDto>(`/v1/vehicles/${vehicleId}/services/${serviceId}`, { method: 'PATCH', body: input }),
    onSuccess: apply,
  });
}

export function useDeleteService(vehicleId: string) {
  const apply = useApplyServiceResult(vehicleId);
  return useMutation({
    mutationFn: (serviceId: string) =>
      apiFetch<{ vehicle: VehicleDto; maintenance: VehicleMaintenanceDto }>(
        `/v1/vehicles/${vehicleId}/services/${serviceId}`,
        { method: 'DELETE' },
      ),
    onSuccess: apply,
  });
}
