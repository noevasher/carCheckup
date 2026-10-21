import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import type { ReactNode } from 'react';
import { AuthProvider } from '../features/auth/AuthProvider';
import { ApiRequestError } from '../lib/api';
import { PERSIST_MAX_AGE, persistOptions } from './persist';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Persisted queries must outlive the persistence window.
      gcTime: PERSIST_MAX_AGE,
      retry: (failureCount, error) =>
        !(error instanceof ApiRequestError && error.status < 500) && failureCount < 2,
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      // The persisted copy may lag behind the last change: refetch once restored (if online).
      onSuccess={() => void queryClient.invalidateQueries()}
    >
      <AuthProvider>{children}</AuthProvider>
    </PersistQueryClientProvider>
  );
}
