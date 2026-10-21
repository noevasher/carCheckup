import type { MileageReadingDto, ReadingPageDto, ReadingResultDto, VehicleDto } from '@car-checkup/shared/dto';
import type { ReadingUpdateInput } from '@car-checkup/shared/schemas';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { invalidateMaintenance } from '../maintenance/api';
import { replaceVehicleInCache } from '../vehicles/api';

const PAGE_SIZE = 30;

export function useReadingsInfinite(vehicleId: string, reviewOnly: boolean) {
  return useInfiniteQuery({
    queryKey: ['readings', vehicleId, reviewOnly ? 'review' : 'all'],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (pageParam !== null) params.set('cursor', pageParam);
      if (reviewOnly) params.set('reviewStatus', 'NEEDS_REVIEW');
      return apiFetch<ReadingPageDto>(`/v1/vehicles/${vehicleId}/readings?${params.toString()}`, { signal });
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** Latest reading of a vehicle (used to correct it from the capture sheet, US2-3). */
export async function fetchLatestReading(vehicleId: string): Promise<MileageReadingDto | undefined> {
  const page = await apiFetch<ReadingPageDto>(`/v1/vehicles/${vehicleId}/readings?limit=1&reviewStatus=OK`);
  return page.items[0];
}

export function useUpdateReading(vehicleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ readingId, input }: { readingId: string; input: ReadingUpdateInput }) =>
      apiFetch<ReadingResultDto>(`/v1/vehicles/${vehicleId}/readings/${readingId}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: (result) => {
      replaceVehicleInCache(queryClient, result.vehicle);
      invalidateMaintenance(queryClient, result.vehicle);
      void queryClient.invalidateQueries({ queryKey: ['readings', vehicleId] });
    },
  });
}

export function useDeleteReading(vehicleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (readingId: string) =>
      apiFetch<VehicleDto>(`/v1/vehicles/${vehicleId}/readings/${readingId}`, { method: 'DELETE' }),
    onSuccess: (vehicle) => {
      replaceVehicleInCache(queryClient, vehicle);
      invalidateMaintenance(queryClient, vehicle);
      void queryClient.invalidateQueries({ queryKey: ['readings', vehicleId] });
    },
  });
}
