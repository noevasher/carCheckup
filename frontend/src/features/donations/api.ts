import type {
  DonationConfigDto,
  DonationHistoryDto,
  DonationResultDto,
  DonationStartResultDto,
  ManageLinkDto,
  ProfileDto,
  SubscriptionDto,
} from '@car-checkup/shared/dto';
import type { DonationStartInput } from '@car-checkup/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { apiFetch } from '../../lib/api';
import { profileKey } from '../vehicles/api';

const configKey = ['donations', 'config'] as const;
const historyKey = ['donations', 'history'] as const;

export function useDonationConfig() {
  return useQuery({
    queryKey: configKey,
    queryFn: ({ signal }) => apiFetch<DonationConfigDto>('/v1/donations/config', { signal }),
  });
}

export function useDonationHistory() {
  return useQuery({
    queryKey: historyKey,
    queryFn: ({ signal }) => apiFetch<DonationHistoryDto>('/v1/donations', { signal }),
  });
}

/** Result screen: polls every 2 s while pending, up to `pollUntil` (research R7). */
export function useDonationResult(id: string | null, pollUntil: number) {
  return useQuery({
    queryKey: ['donations', 'result', id],
    enabled: id !== null,
    queryFn: ({ signal }) => apiFetch<DonationResultDto>(`/v1/donations/${id ?? ''}`, { signal }),
    refetchInterval: (query) =>
      query.state.data?.status === 'PENDING' && Date.now() < pollUntil ? 2000 : false,
    gcTime: 0,
  });
}

export function useStartDonation() {
  return useMutation({
    mutationFn: (input: DonationStartInput) =>
      apiFetch<DonationStartResultDto>('/v1/donations', { method: 'POST', body: input }),
  });
}

export function usePayPalReturn() {
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<DonationResultDto>(`/v1/donations/${id}/paypal-return`, {
        method: 'POST',
        body: {},
      }),
  });
}

/** After a confirmation the benefit and the home card change. */
export function useRefreshAfterDonation() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: profileKey });
    void queryClient.invalidateQueries({ queryKey: ['donations', 'config'] });
    void queryClient.invalidateQueries({ queryKey: ['donations', 'history'] });
  }, [queryClient]);
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<SubscriptionDto>('/v1/donations/subscription/cancel', { method: 'POST', body: {} }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['donations'] });
    },
  });
}

export function useManageLink() {
  return useMutation({
    mutationFn: () =>
      apiFetch<ManageLinkDto>('/v1/donations/subscription/manage-link', {
        method: 'POST',
        body: {},
      }),
  });
}

export function useDismissDonationCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<undefined>('/v1/donations/card/dismiss', { method: 'POST', body: {} }),
    onMutate: () => {
      queryClient.setQueryData<ProfileDto>(
        profileKey,
        (p) => p && { ...p, showDonationCard: false },
      );
    },
  });
}

export function useFakeComplete() {
  return useMutation({
    mutationFn: ({ id, outcome }: { id: string; outcome: 'paid' | 'canceled' }) =>
      apiFetch<undefined>(`/v1/donations/${id}/fake-complete`, {
        method: 'POST',
        body: { outcome },
      }),
  });
}
