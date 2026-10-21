import type { ReadingOrigin } from '@car-checkup/shared/dto';
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

/** Queue item, per contracts/offline-sync.md (+ userId, origin and backoff bookkeeping). */
export interface PendingReading {
  id: string;
  userId: string;
  vehicleId: string;
  odometerKm: number;
  readAt: string;
  confirmedUnusual: boolean;
  origin: ReadingOrigin;
  queuedAt: string;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
}

interface CarCheckupDB extends DBSchema {
  pendingReadings: {
    key: string;
    value: PendingReading;
    indexes: { byUser: string; byQueuedAt: string };
  };
}

let dbPromise: Promise<IDBPDatabase<CarCheckupDB>> | null = null;

function db(): Promise<IDBPDatabase<CarCheckupDB>> {
  dbPromise ??= openDB<CarCheckupDB>('car-checkup', 1, {
    upgrade(database) {
      const store = database.createObjectStore('pendingReadings', { keyPath: 'id' });
      store.createIndex('byUser', 'userId');
      store.createIndex('byQueuedAt', 'queuedAt');
    },
  });
  return dbPromise;
}

const changes = new EventTarget();

export function subscribeQueue(listener: () => void): () => void {
  changes.addEventListener('change', listener);
  return () => {
    changes.removeEventListener('change', listener);
  };
}

const notify = () => changes.dispatchEvent(new Event('change'));

export async function enqueue(item: PendingReading): Promise<void> {
  await (await db()).put('pendingReadings', item);
  notify();
}

/** Pending readings of a user, FIFO by queuedAt. */
export async function listPending(userId: string): Promise<PendingReading[]> {
  const items = await (await db()).getAllFromIndex('pendingReadings', 'byUser', userId);
  return items.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function getPending(id: string): Promise<PendingReading | undefined> {
  return (await db()).get('pendingReadings', id);
}

export async function remove(id: string): Promise<void> {
  await (await db()).delete('pendingReadings', id);
  notify();
}

export async function markAttempt(
  id: string,
  changesToApply: Pick<PendingReading, 'lastError' | 'nextAttemptAt'> & Partial<Pick<PendingReading, 'origin'>>,
): Promise<void> {
  const database = await db();
  const item = await database.get('pendingReadings', id);
  if (item === undefined) return;
  await database.put('pendingReadings', { ...item, ...changesToApply, attempts: item.attempts + 1 });
  notify();
}
