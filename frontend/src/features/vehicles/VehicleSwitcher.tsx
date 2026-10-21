import type { VehicleDto } from '@car-checkup/shared/dto';
import { Link } from 'react-router';
import { cx } from '../../design/cx';
import { t } from '../../i18n/es';

export const vehicleTitle = (v: Pick<VehicleDto, 'nickname' | 'make' | 'model'>): string =>
  v.nickname ?? `${v.make} ${v.model}`;

/** Maintenance marker on a vehicle chip (feature 002, FR-007b). */
function MaintenanceBadge({ summary }: { summary: VehicleDto['maintenance'] }) {
  if (summary.overdueCount > 0) {
    const label = t.vehicle.badgeOverdue(summary.overdueCount);
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        className="inline-flex min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-xs font-bold text-white"
      >
        {summary.overdueCount}
      </span>
    );
  }
  if (summary.upcomingCount > 0) {
    const label = t.vehicle.badgeUpcoming(summary.upcomingCount);
    return <span role="img" aria-label={label} title={label} className="size-2.5 rounded-full bg-warning" />;
  }
  return null;
}

/** One tap switches the active vehicle (FR-011); scrolls horizontally for many vehicles. */
export function VehicleSwitcher({
  vehicles,
  activeId,
  onSelect,
}: {
  vehicles: readonly VehicleDto[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <nav aria-label={t.home.switcher} className="-mx-4 mb-4 overflow-x-auto px-4">
      <ul className="flex w-max gap-2">
        {vehicles.map((v) => {
          const active = v.id === activeId;
          return (
            <li key={v.id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => {
                  onSelect(v.id);
                }}
                className={cx(
                  'inline-flex min-h-tap max-w-56 items-center gap-2 rounded-full border px-4 font-medium',
                  active ? 'border-primary bg-primary text-on-primary' : 'border-border bg-surface',
                )}
              >
                <span className="truncate">{vehicleTitle(v)}</span>
                <MaintenanceBadge summary={v.maintenance} />
              </button>
            </li>
          );
        })}
        <li>
          <Link
            to="/vehicles/new"
            className="inline-flex min-h-tap items-center rounded-full border border-dashed border-border px-4 font-medium text-primary"
          >
            + {t.vehicle.add}
          </Link>
        </li>
      </ul>
    </nav>
  );
}
