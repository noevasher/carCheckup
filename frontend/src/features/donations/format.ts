import { useSyncExternalStore } from 'react';
import { type messageForError, t } from '../../i18n/es';
import { ApiRequestError, NetworkError } from '../../lib/api';

export type ErrorCode = Parameters<typeof messageForError>[0];

/** Error code for `messageForError` from a failed API call. */
export function errorCode(err: unknown): ErrorCode {
  if (err instanceof NetworkError) return 'NETWORK';
  return err instanceof ApiRequestError ? err.body?.error.code : undefined;
}

const longDate = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
export const formatLongDate = (iso: string): string => longDate.format(new Date(iso));

const mxn = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
export const formatMxn = (amount: number): string => `${mxn.format(amount)} MXN`;

export const providerLabel = (p: 'STRIPE' | 'PAYPAL'): string =>
  p === 'STRIPE' ? t.donations.card : t.donations.paypal;

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** Browser connectivity (donations need the provider's page: no offline donations). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
