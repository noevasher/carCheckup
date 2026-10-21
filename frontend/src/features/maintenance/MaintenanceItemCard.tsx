import type { MaintenanceItemDto } from '@car-checkup/shared/dto';
import { daysBetweenCalendarDates, todayInTimeZone, toCalendarDate } from '@car-checkup/shared/maintenance';
import type { ReactNode } from 'react';
import { cx } from '../../design/cx';
import { daysLabel, t } from '../../i18n/es';
import { formatDate, formatKm } from '../../lib/format';
import { userTimeZone } from './api';

const chip = {
  OVERDUE: 'bg-danger-bg text-danger',
  UPCOMING: 'bg-warning-bg text-warning',
  OK: 'bg-success-bg text-success',
} as const;

export function StatusChip({ status }: { status: NonNullable<MaintenanceItemDto['status']> }) {
  return (
    <span className={cx('shrink-0 rounded-full px-3 py-1 text-sm font-semibold', chip[status])}>
      {t.maintenance.status[status]}
    </span>
  );
}

/** "Faltan 500 km" / "Te pasaste 2.500 km" / "Vence en 20 días" / "Venció hace 3 días". */
export function remainingLabel(item: MaintenanceItemDto): string | null {
  if (item.remainingKm !== null) {
    return item.remainingKm > 0
      ? t.maintenance.kmLeft(formatKm(item.remainingKm))
      : t.maintenance.kmOver(formatKm(-item.remainingKm));
  }
  if (item.dueByTimeAt !== null) {
    const tz = userTimeZone();
    const days = daysBetweenCalendarDates(todayInTimeZone(tz), toCalendarDate(item.dueByTimeAt, tz));
    return days >= 0 ? t.maintenance.daysLeft(daysLabel(days)) : t.maintenance.daysOver(daysLabel(-days));
  }
  return null;
}

export function dateLabel(item: MaintenanceItemDto): string {
  if (item.estimatedDueAt === null) return t.maintenance.noDate;
  const date = formatDate(item.estimatedDueAt);
  return item.status === 'OVERDUE' && new Date(item.estimatedDueAt) < new Date()
    ? t.maintenance.wasDue(date)
    : t.maintenance.around(date);
}

export function MaintenanceItemCard({ item, actions }: { item: MaintenanceItemDto; actions?: ReactNode }) {
  const remaining = remainingLabel(item);
  return (
    <article className="rounded-card border border-border bg-surface p-4" aria-label={t.maintenance.names[item.typeCode]}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">{t.maintenance.names[item.typeCode]}</h3>
        {item.status !== null && <StatusChip status={item.status} />}
      </div>
      {remaining !== null && <p className="mt-1 font-medium">{remaining}</p>}
      <p className="text-text-muted">{dateLabel(item)}</p>
      {item.snoozed && item.snoozedUntil !== null && (
        <p className="mt-1 text-sm text-text-muted">{t.maintenance.snoozedUntil(formatDate(item.snoozedUntil))}</p>
      )}
      {actions !== undefined && <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-1">{actions}</div>}
    </article>
  );
}
