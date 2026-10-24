import type { MaintenanceTypeCode, NoticeKind } from '../generated/prisma/enums';
import { MAINTENANCE_NAMES_ES } from '../i18n/maintenance-es';
import { daysBetweenCalendarDates, toCalendarDate } from '../maintenance/dates';

export interface DigestNotice {
  id: string;
  vehicleId: string;
  kind: NoticeKind;
  typeCode: MaintenanceTypeCode | null;
  remainingKm: number | null;
  overdueDays: number | null;
  estimatedDueAt: Date | null;
}

export interface DigestVehicle {
  id: string;
  make: string;
  model: string;
  nickname: string | null;
  emailReminders: boolean;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export const EMAIL_MAX_NOTICES = 10;

const kindRank: Record<NoticeKind, number> = { MAINTENANCE_OVERDUE: 0, MAINTENANCE_UPCOMING: 1, MILEAGE_UPDATE: 2 };

/** Overdue first, then upcoming (nearest date first), then mileage reminders. */
export function sortNotices<T extends DigestNotice>(notices: readonly T[]): T[] {
  return [...notices].sort((a, b) => {
    const r = kindRank[a.kind] - kindRank[b.kind];
    if (r !== 0) return r;
    const ta = a.estimatedDueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const tb = b.estimatedDueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    return ta - tb;
  });
}

/** Name as shown in the app: nickname or "make model" — never the plate (FR-010a). */
export const vehicleName = (v: Pick<DigestVehicle, 'make' | 'model' | 'nickname'>): string =>
  v.nickname ?? `${v.make} ${v.model}`;

const km = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' });
const formatKm = (n: number): string => `${km.format(n)} km`;
const days = (n: number): string => `${String(n)} ${n === 1 ? 'día' : 'días'}`;
const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/** "faltan 500 km" / "te pasaste 500 km" / "venció hace 3 días" / "vence en 20 días". */
export function noticeDetail(n: DigestNotice, today: string, timeZone: string): string {
  if (n.remainingKm !== null) {
    return n.remainingKm > 0 ? `faltan ${formatKm(n.remainingKm)}` : `te pasaste ${formatKm(-n.remainingKm)}`;
  }
  if (n.overdueDays !== null) return n.overdueDays === 0 ? 'vence hoy' : `venció hace ${days(n.overdueDays)}`;
  if (n.estimatedDueAt !== null) {
    const d = daysBetweenCalendarDates(today, toCalendarDate(n.estimatedDueAt, timeZone));
    return d <= 0 ? 'vence hoy' : `vence en ${days(d)}`;
  }
  return 'revísalo en la app';
}

/** One-line text of a notice, e.g. "Toyota Corolla: cambio de aceite y filtro vencido, te pasaste 500 km." */
export function noticeSentence(n: DigestNotice, vehicle: DigestVehicle, today: string, timeZone: string): string {
  const name = vehicleName(vehicle);
  if (n.kind === 'MILEAGE_UPDATE' || n.typeCode === null) {
    return `¿Cuánto marca hoy tu ${name}? Actualízalo para afinar tus recomendaciones.`;
  }
  const state = n.kind === 'MAINTENANCE_OVERDUE' ? 'vencido' : 'próximo';
  return `${name}: ${lowerFirst(MAINTENANCE_NAMES_ES[n.typeCode])} ${state}, ${noticeDetail(n, today, timeZone)}.`;
}

/** Where tapping the notification leads (contracts/notifications.md). */
export function pushUrl(notices: readonly DigestNotice[]): string {
  const first = notices[0];
  if (first === undefined) return '/';
  if (notices.length === 1 && first.kind === 'MILEAGE_UPDATE') return `/?capture=${first.vehicleId}`;
  const vehicles = new Set(notices.map((n) => n.vehicleId));
  return vehicles.size === 1 ? `/vehicles/${first.vehicleId}/maintenance` : '/';
}

/** Daily push payload (FR-010, FR-010a): most urgent notice + "Y N avisos más". */
export function buildPushPayload(
  notices: readonly DigestNotice[],
  vehicles: ReadonlyMap<string, DigestVehicle>,
  today: string,
  timeZone: string,
): PushPayload | null {
  const sorted = sortNotices(notices);
  const first = sorted[0];
  const vehicle = first === undefined ? undefined : vehicles.get(first.vehicleId);
  if (first === undefined || vehicle === undefined) return null;
  const more = sorted.length - 1;
  const tail = more === 0 ? '' : more === 1 ? ' Y 1 aviso más.' : ` Y ${String(more)} avisos más.`;
  return {
    title: 'Car Checkup',
    body: noticeSentence(first, vehicle, today, timeZone) + tail,
    url: pushUrl(sorted),
    tag: `digest-${today}`,
  };
}

export interface EmailSelection<T extends DigestNotice> {
  /** Up to 10 notices of email-enabled vehicles, grouped by vehicle (urgency order). */
  groups: { vehicle: DigestVehicle; notices: T[] }[];
  shown: T[];
  hiddenCount: number;
}

/** Email content selection (FR-009, FR-010): only vehicles with email, max 10 notices. */
export function selectEmailNotices<T extends DigestNotice>(
  notices: readonly T[],
  vehicles: ReadonlyMap<string, DigestVehicle>,
): EmailSelection<T> {
  const eligible = sortNotices(notices.filter((n) => vehicles.get(n.vehicleId)?.emailReminders === true));
  const shown = eligible.slice(0, EMAIL_MAX_NOTICES);
  const groups: { vehicle: DigestVehicle; notices: T[] }[] = [];
  for (const n of shown) {
    const vehicle = vehicles.get(n.vehicleId);
    if (vehicle === undefined) continue;
    const group = groups.find((g) => g.vehicle.id === vehicle.id);
    if (group !== undefined) group.notices.push(n);
    else groups.push({ vehicle, notices: [n] });
  }
  return { groups, shown, hiddenCount: eligible.length - shown.length };
}
