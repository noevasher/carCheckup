import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { createStore, del, get, set } from 'idb-keyval';

const store = createStore('car-checkup-query-cache', 'cache');
const KEY = 'car-checkup';
export const PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/** Queries kept on the device so the home screen works offline after a reload (research R10). */
const PERSISTED_KEYS = new Set(['vehicles', 'vehicle', 'maintenance', 'profile']);

const persister = createAsyncStoragePersister({
  key: KEY,
  storage: {
    getItem: (key) => get<string>(key, store),
    setItem: (key, value: string) => set(key, value, store),
    removeItem: (key) => del(key, store),
  },
});

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: PERSIST_MAX_AGE,
  buster: '002',
  dehydrateOptions: {
    shouldDehydrateQuery: (query) =>
      query.state.status === 'success' && PERSISTED_KEYS.has(String(query.queryKey[0])),
  },
};

export async function clearPersistedCache(): Promise<void> {
  try {
    await del(KEY, store);
  } catch {
    // IndexedDB unavailable: nothing persisted.
  }
}
