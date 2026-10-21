import type { ReadingPageDto, VehicleDto } from '@car-checkup/shared/dto';
import type { ValidRange } from '@car-checkup/shared/errors';
import {
  checkOrder,
  DEFAULT_UNUSUAL_KM_PER_DAY,
  findNeighbors,
  isFutureDate,
  isUnusual,
  type ReadingPoint,
} from '@car-checkup/shared/validation';
import { type InfiniteData, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { messageForError } from '../../i18n/es';
import { enqueue } from '../../offline/queue';
import { syncOne, usePendingReadings } from '../../offline/sync';
import { useUserId } from '../auth/AuthProvider';

export type CaptureResult =
  | { status: 'saved' }
  | { status: 'needs_review' }
  | { status: 'pending' }
  | { status: 'out_of_order'; validRange: ValidRange }
  | { status: 'confirm_unusual'; distanceKm: number; days: number }
  | { status: 'error'; message: string };

const DAY_MS = 86_400_000;

/**
 * Captures a reading: validates locally with the shared rules (works offline), writes it to the
 * queue first and sends it right away when online (contracts/offline-sync.md, rule 1).
 */
export function useCaptureReading(vehicle: VehicleDto) {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const pending = usePendingReadings(vehicle.id);

  return useCallback(
    async (input: { odometerKm: number; readAt: string; confirmedUnusual: boolean }): Promise<CaptureResult> => {
      if (isFutureDate(input.readAt)) return { status: 'error', message: 'La fecha no puede ser futura.' };

      // Known readings: server latest + cached history pages + still-queued readings.
      const known: ReadingPoint[] = [
        { id: 'server-latest', odometerKm: vehicle.currentOdometerKm, readAt: vehicle.lastReadingAt, reviewStatus: 'OK' },
        ...pending.map((p) => ({ id: p.id, odometerKm: p.odometerKm, readAt: p.readAt, reviewStatus: 'OK' as const })),
      ];
      for (const [, data] of queryClient.getQueriesData<InfiniteData<ReadingPageDto>>({
        queryKey: ['readings', vehicle.id],
      })) {
        for (const page of data?.pages ?? []) known.push(...page.items);
      }

      const { prev, next } = findNeighbors(known, input.readAt);
      const order = checkOrder(input.odometerKm, prev, next);
      if (!order.ok) return { status: 'out_of_order', validRange: order.validRange };
      if (!input.confirmedUnusual && isUnusual(input.odometerKm, prev, input.readAt, DEFAULT_UNUSUAL_KM_PER_DAY)) {
        const days = prev === null ? 1 : Math.max((Date.parse(input.readAt) - Date.parse(String(prev.readAt))) / DAY_MS, 1);
        return { status: 'confirm_unusual', distanceKm: input.odometerKm - (prev?.odometerKm ?? 0), days };
      }

      const id = crypto.randomUUID();
      const online = navigator.onLine;
      await enqueue({
        id,
        userId,
        vehicleId: vehicle.id,
        odometerKm: input.odometerKm,
        readAt: input.readAt,
        confirmedUnusual: input.confirmedUnusual,
        origin: online ? 'ONLINE' : 'OFFLINE_SYNC',
        queuedAt: new Date().toISOString(),
        attempts: 0,
        lastError: null,
        nextAttemptAt: null,
      });
      if (!online) return { status: 'pending' };

      const outcome = await syncOne(id);
      switch (outcome.kind) {
        case 'saved':
          return { status: 'saved' };
        case 'needs_review':
          return { status: 'needs_review' };
        case 'deferred':
          return { status: 'pending' };
        case 'gone':
          return { status: 'error', message: messageForError('NOT_FOUND') };
        case 'rejected': {
          const body = outcome.error.body?.error;
          if (body?.code === 'READING_OUT_OF_ORDER' && body.validRange !== undefined) {
            return { status: 'out_of_order', validRange: body.validRange };
          }
          if (body?.code === 'UNUSUAL_DISTANCE') {
            return { status: 'confirm_unusual', distanceKm: input.odometerKm - (prev?.odometerKm ?? 0), days: 1 };
          }
          return { status: 'error', message: messageForError(body?.code) };
        }
      }
    },
    [vehicle, pending, queryClient, userId],
  );
}
