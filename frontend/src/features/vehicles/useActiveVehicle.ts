import type { VehicleDto } from '@car-checkup/shared/dto';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';
import { apiFetch } from '../../lib/api';
import { useUserId } from '../auth/AuthProvider';
import { profileKey, useProfile } from './api';

const storageKey = (userId: string) => `car-checkup:active-vehicle:${userId}`;
const listeners = new Set<() => void>();

function readStored(userId: string): string | null {
  try {
    return localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

export function storeActiveVehicle(userId: string, vehicleId: string): void {
  try {
    localStorage.setItem(storageKey(userId), vehicleId);
  } catch {
    // Storage unavailable (private mode): the server copy still applies.
  }
  for (const l of listeners) l();
}

/**
 * Active vehicle (FR-011): the locally cached choice renders instantly, then the server copy
 * (Profile.activeVehicleId) is used when the local one is missing or no longer exists.
 */
export function useActiveVehicle(vehicles: readonly VehicleDto[] | undefined) {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const profile = useProfile();
  const stored = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => readStored(userId),
  );

  const byId = (id: string | null | undefined) =>
    id == null ? undefined : vehicles?.find((v) => v.id === id);
  const active = byId(stored) ?? byId(profile.data?.activeVehicleId) ?? vehicles?.[0];

  const setActive = useCallback(
    (vehicleId: string) => {
      storeActiveVehicle(userId, vehicleId);
      queryClient.setQueryData(profileKey, { id: userId, activeVehicleId: vehicleId });
      apiFetch('/v1/me', { method: 'PATCH', body: { activeVehicleId: vehicleId } }).catch(() => {
        // Offline or transient failure: the local choice still applies and syncs next time.
      });
    },
    [userId, queryClient],
  );

  return { active, setActive };
}
