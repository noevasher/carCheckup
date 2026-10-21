const kmFormatter = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' });

export const formatKm = (km: number): string => `${kmFormatter.format(km)} km`;

const relative = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
const DAY_MS = 86_400_000;

/** "hoy", "ayer", "hace 3 días", "hace 2 meses"... */
export function formatRelativeDay(iso: string, now: Date = new Date()): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date(iso)) - startOfDay(now)) / DAY_MS);
  if (Math.abs(days) < 30) return relative.format(days, 'day');
  const months = Math.round(days / 30);
  if (Math.abs(months) < 12) return relative.format(months, 'month');
  return relative.format(Math.round(days / 365), 'year');
}

const dateFormatter = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
export const formatDate = (iso: string): string => dateFormatter.format(new Date(iso));

/** yyyy-mm-dd in local time, for <input type="date">. */
export function toDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Converts a date input value to an ISO instant: now for today, local noon for past days. */
export function dateInputToIso(value: string, now: Date = new Date()): string {
  if (value === '' || value === toDateInputValue(now)) return now.toISOString();
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1, 12, 0, 0).toISOString();
}

/** Month value (YYYY-MM) → the 15th of that month, or today if that would be in the future. */
export function monthToDate(month: string, now: Date = new Date()): string {
  const today = toDateInputValue(now);
  const mid = `${month}-15`;
  return mid > today ? today : mid;
}
