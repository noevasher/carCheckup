import type { ReadingResultDto, VehicleDto } from '@car-checkup/shared/dto';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useUserId } from '../features/auth/AuthProvider';
import { messageForError, t } from '../i18n/es';
import { ApiRequestError, apiFetch, NetworkError } from '../lib/api';
import { supabase } from '../lib/supabase';
import { pushNotice } from './notices';
import {
  getPending,
  listPending,
  markAttempt,
  type PendingReading,
  remove,
  subscribeQueue,
} from './queue';

/** Result of trying to send one queued reading (contracts/offline-sync.md, rule 5). */
export type SendOutcome =
  | { kind: 'saved'; result: ReadingResultDto }
  | { kind: 'needs_review'; result: ReadingResultDto }
  | { kind: 'rejected'; error: ApiRequestError }
  | { kind: 'gone' }
  | { kind: 'deferred' };

const MAX_BACKOFF_MS = 5 * 60 * 1000;
const backoffMs = (attempts: number) => Math.min(1000 * 2 ** attempts, MAX_BACKOFF_MS);

interface SyncConfig {
  userId: string;
  queryClient: QueryClient;
}

let config: SyncConfig | null = null;
let running = false;
let rerun = false;
let paused = false;
// Read through a function: the flag changes across awaits, which control-flow analysis can't see.
const isPaused = (): boolean => paused;
let timer: ReturnType<typeof setTimeout> | undefined;
const inFlight = new Map<string, Promise<SendOutcome>>();

function applyResult(queryClient: QueryClient, vehicle: VehicleDto): void {
  queryClient.setQueryData<VehicleDto[]>(['vehicles'], (list) =>
    list?.map((v) => (v.id === vehicle.id ? vehicle : v)),
  );
  void queryClient.invalidateQueries({ queryKey: ['readings', vehicle.id] });
}

async function send(item: PendingReading, interactive: boolean): Promise<SendOutcome> {
  const current = config;
  if (current === null) return { kind: 'deferred' };
  try {
    const result = await apiFetch<ReadingResultDto>(`/v1/vehicles/${item.vehicleId}/readings`, {
      method: 'POST',
      body: {
        id: item.id,
        odometerKm: item.odometerKm,
        readAt: item.readAt,
        origin: item.origin,
        confirmedUnusual: item.confirmedUnusual,
      },
    });
    await remove(item.id);
    applyResult(current.queryClient, result.vehicle);
    if (result.reading.reviewStatus === 'NEEDS_REVIEW') {
      if (!interactive) {
        pushNotice({
          tone: 'warning',
          text: t.capture.savedNeedsReview,
          action: { label: t.home.reviewAction, to: `/vehicles/${item.vehicleId}/history?review=1` },
        });
      }
      return { kind: 'needs_review', result };
    }
    return { kind: 'saved', result };
  } catch (err) {
    if (err instanceof ApiRequestError) {
      if (err.status === 401) {
        paused = true;
        return { kind: 'deferred' };
      }
      if (err.status === 404) {
        await remove(item.id);
        pushNotice({ tone: 'warning', text: messageForError('NOT_FOUND') });
        return { kind: 'gone' };
      }
      if (err.status === 422 || err.status === 409) {
        await remove(item.id);
        if (!interactive) {
          pushNotice({ tone: 'danger', text: messageForError(err.body?.error.code, err.body?.error.validRange) });
        }
        return { kind: 'rejected', error: err };
      }
    } else if (!(err instanceof NetworkError)) {
      throw err;
    }
    // Network failure or 5xx/429: keep it and retry later. Once a reading could not be sent
    // interactively it is treated as captured offline (the server then never rejects it by order).
    await markAttempt(item.id, {
      lastError: err instanceof ApiRequestError ? (err.code ?? String(err.status)) : 'NETWORK',
      nextAttemptAt: new Date(Date.now() + backoffMs(item.attempts)).toISOString(),
      origin: 'OFFLINE_SYNC',
    });
    scheduleRetry();
    return { kind: 'deferred' };
  }
}

/** Sends one item, de-duplicating concurrent sends of the same id. */
function sendOnce(item: PendingReading, interactive: boolean): Promise<SendOutcome> {
  const existing = inFlight.get(item.id);
  if (existing !== undefined) return existing;
  const promise = send(item, interactive).finally(() => inFlight.delete(item.id));
  inFlight.set(item.id, promise);
  return promise;
}

/** Sends a freshly captured reading right away and reports the outcome to the capture UI. */
export async function syncOne(id: string): Promise<SendOutcome> {
  const item = await getPending(id);
  if (item === undefined || paused) return { kind: 'deferred' };
  return sendOnce(item, true);
}

/** Drains the queue FIFO, one request at a time (contracts/offline-sync.md, rules 3–4). */
export async function syncPending(): Promise<void> {
  const current = config;
  if (current === null || paused) return;
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  try {
    const now = Date.now();
    for (const item of await listPending(current.userId)) {
      if (item.nextAttemptAt !== null && Date.parse(item.nextAttemptAt) > now) continue;
      await sendOnce(item, false);
      if (isPaused() || config !== current) break;
    }
  } finally {
    running = false;
  }
  if (rerun) {
    rerun = false;
    await syncPending();
  } else {
    scheduleRetry();
  }
}

function scheduleRetry(): void {
  const current = config;
  if (current === null) return;
  void listPending(current.userId).then((items) => {
    const next = items
      .map((i) => (i.nextAttemptAt === null ? Date.now() : Date.parse(i.nextAttemptAt)))
      .sort((a, b) => a - b)[0];
    clearTimeout(timer);
    if (next !== undefined) {
      timer = setTimeout(() => void syncPending(), Math.max(next - Date.now(), 1000));
    }
  });
}

/** Starts the sync triggers for the signed-in user (app start, online, foreground, auth). */
export function useSyncLifecycle(): void {
  const userId = useUserId();
  const queryClient = useQueryClient();

  useEffect(() => {
    config = { userId, queryClient };
    paused = false;
    const trigger = () => void syncPending();
    const onVisible = () => {
      if (document.visibilityState === 'visible') trigger();
    };
    window.addEventListener('online', trigger);
    document.addEventListener('visibilitychange', onVisible);
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        paused = false;
        trigger();
      }
    });
    trigger();
    return () => {
      window.removeEventListener('online', trigger);
      document.removeEventListener('visibilitychange', onVisible);
      data.subscription.unsubscribe();
      clearTimeout(timer);
      config = null;
    };
  }, [userId, queryClient]);
}

/** Readings of a vehicle still waiting in the local queue, newest reading first. */
export function usePendingReadings(vehicleId: string | undefined): PendingReading[] {
  const userId = useUserId();
  const [items, setItems] = useState<PendingReading[]>([]);

  useEffect(() => {
    let active = true;
    const load = () =>
      void listPending(userId).then((all) => {
        if (active) setItems(all);
      });
    load();
    const unsubscribe = subscribeQueue(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId]);

  return items
    .filter((i) => i.vehicleId === vehicleId)
    .sort((a, b) => b.readAt.localeCompare(a.readAt));
}
