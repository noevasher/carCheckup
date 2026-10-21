import type { MaintenanceItemDto, PaceDto } from '@car-checkup/shared/dto';
import { daysLabel, t } from '../../i18n/es';
import { formatDate, formatKm } from '../../lib/format';

const e = t.maintenance.explain;

function monthsLabel(months: number): string {
  if (months % 12 === 0) {
    const years = months / 12;
    return `${String(years)} ${years === 1 ? 'año' : 'años'}`;
  }
  return `${String(months)} ${months === 1 ? 'mes' : 'meses'}`;
}

/** "10.000 km o 12 meses (lo que ocurra primero)", "24 meses", "8.000 km". */
export function describeInterval(km: number | null, months: number | null): string {
  if (km !== null && months !== null) return `${formatKm(km)} o ${monthsLabel(months)} (lo que ocurra primero)`;
  if (km !== null) return formatKm(km);
  if (months !== null) return monthsLabel(months);
  return '';
}

/** Plain-language explanation of an estimate (FR-008, research R11). */
export function explain(item: MaintenanceItemDto, pace: PaceDto, currentOdometerKm: number): string[] {
  const lines: string[] = [];
  const { interval, baseline } = item;
  const every = describeInterval(interval.km, interval.months);
  lines.push(
    interval.source === 'CITY_ADJUSTED'
      ? e.interval.CITY_ADJUSTED(every, describeInterval(interval.defaultKm, interval.defaultMonths))
      : e.interval[interval.source](every),
  );
  if (baseline !== null) lines.push(e.baseline[baseline.source](formatKm(baseline.km), formatDate(baseline.at)));
  lines.push(e.current(formatKm(currentOdometerKm)));

  const parked = pace.kmPerDay === 0;
  if (parked) lines.push(e.parked);
  else if (pace.source === 'READINGS') lines.push(e.paceReadings(formatKm(Math.round(pace.kmPerDay)), daysLabel(pace.windowDays ?? 0)));
  else if (pace.usageType !== null) lines.push(e.paceUsage(formatKm(Math.round(pace.kmPerDay)), e.usage[pace.usageType]));
  else lines.push(e.paceUnknown(formatKm(Math.round(pace.kmPerDay))));

  if (item.limitingFactor === 'KM' && item.dueKm !== null && item.estimatedDueAt !== null) {
    lines.push(e.dueKm(formatKm(item.dueKm), formatDate(item.estimatedDueAt)));
    if (item.dueByTimeAt !== null) lines.push(e.limitKm);
  } else if (item.limitingFactor === 'TIME' && item.dueByTimeAt !== null) {
    lines.push(e.limitTime(formatDate(item.dueByTimeAt)));
  }
  return lines;
}
