import type { ProfileDto, VehicleDto, VehicleListDto } from '@car-checkup/shared/dto';
import type { VehicleCreateInput, VehicleUpdateInput } from '@car-checkup/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';

export const vehiclesKey = ['vehicles'] as const;
export const profileKey = ['profile'] as const;

export function useVehicles() {
  return useQuery({
    queryKey: vehiclesKey,
    queryFn: async ({ signal }) => (await apiFetch<VehicleListDto>('/v1/vehicles', { signal })).items,
  });
}

export function useVehicle(id: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['vehicle', id],
    queryFn: ({ signal }) => apiFetch<VehicleDto>(`/v1/vehicles/${id}`, { signal }),
    initialData: () => queryClient.getQueryData<VehicleDto[]>(vehiclesKey)?.find((v) => v.id === id),
  });
}

export function useProfile() {
  return useQuery({
    queryKey: profileKey,
    queryFn: ({ signal }) => apiFetch<ProfileDto>('/v1/me', { signal }),
  });
}

/** Wire format of VehicleCreateInput (same fields; enums and nulls are JSON-compatible). */
export function useCreateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: VehicleCreateInput) =>
      apiFetch<VehicleDto>('/v1/vehicles', { method: 'POST', body: input }),
    onSuccess: (vehicle) => {
      queryClient.setQueryData<VehicleDto[]>(vehiclesKey, (list) =>
        list === undefined ? [vehicle] : [...list.filter((v) => v.id !== vehicle.id), vehicle],
      );
      queryClient.setQueryData<ProfileDto>(profileKey, (p) => p && { ...p, activeVehicleId: vehicle.id });
    },
  });
}

export function replaceVehicleInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  vehicle: VehicleDto,
): void {
  queryClient.setQueryData<VehicleDto[]>(vehiclesKey, (list) =>
    list?.map((v) => (v.id === vehicle.id ? vehicle : v)),
  );
  queryClient.setQueryData(['vehicle', vehicle.id], vehicle);
}

export function useUpdateVehicle(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: VehicleUpdateInput) =>
      apiFetch<VehicleDto>(`/v1/vehicles/${id}`, { method: 'PATCH', body: input }),
    onSuccess: (vehicle) => {
      replaceVehicleInCache(queryClient, vehicle);
      // Fuel type and usage change which maintenance applies (FR-019).
      void queryClient.invalidateQueries({ queryKey: ['maintenance', vehicle.id] });
    },
  });
}

export function useDeleteVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<undefined>(`/v1/vehicles/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<VehicleDto[]>(vehiclesKey, (list) => list?.filter((v) => v.id !== id));
      queryClient.removeQueries({ queryKey: ['vehicle', id] });
      queryClient.removeQueries({ queryKey: ['readings', id] });
      void queryClient.invalidateQueries({ queryKey: profileKey });
    },
  });
}
