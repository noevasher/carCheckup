import type { MaintenanceItemDto, VehicleDto } from '@car-checkup/shared/dto';
import { Link } from 'react-router';
import { Button, Skeleton } from '../../design/components';
import { t } from '../../i18n/es';
import { formatDate } from '../../lib/format';
import { useUpdateMaintenanceSetting, useVehicleMaintenance } from './api';
import { MaintenanceItemCard } from './MaintenanceItemCard';
import { useMaintenanceSheets } from './useMaintenanceSheets';

const MAX_ALERTS = 3;

/**
 * Home alerts (FR-007, FR-007a): up to 3 overdue/upcoming non-snoozed items with what to do, when
 * and why; otherwise "Todo al día" and the next one.
 */
export function MaintenanceAlerts({ vehicle }: { vehicle: VehicleDto }) {
  const maintenance = useVehicleMaintenance(vehicle.id);
  const snooze = useUpdateMaintenanceSetting(vehicle.id);
  const sheets = useMaintenanceSheets(vehicle, maintenance.data);

  if (maintenance.isPending) return <Skeleton className="mt-4 h-32" />;
  if (maintenance.data === undefined) return null;

  const visible = maintenance.data.items.filter((i) => i.enabled && !i.snoozed);
  const alerts = visible.filter((i) => i.status === 'OVERDUE' || i.status === 'UPCOMING').slice(0, MAX_ALERTS);
  const next = visible.find((i) => i.status === 'OK');

  const actions = (item: MaintenanceItemDto) => (
    <>
      <Button
        onClick={() => {
          sheets.record({ mode: 'create', typeCode: item.typeCode });
        }}
      >
        {t.maintenance.done}
      </Button>
      <Button
        variant="ghost"
        className="px-3"
        onClick={() => {
          sheets.explain(item);
        }}
      >
        {t.maintenance.why}
      </Button>
      <Button
        variant="ghost"
        className="px-3"
        loading={snooze.isPending && snooze.variables.typeCode === item.typeCode}
        onClick={() => {
          snooze.mutate({ typeCode: item.typeCode, input: { snooze: true } });
        }}
      >
        {t.maintenance.snoozeShort}
      </Button>
      {item.askHistory && (
        <Button
          variant="ghost"
          className="w-full justify-start px-0 text-sm font-medium"
          onClick={() => {
            sheets.askHistory(item);
          }}
        >
          {t.maintenance.askHistory}
        </Button>
      )}
    </>
  );

  return (
    <section className="mt-6" aria-labelledby="maintenance-title">
      <h2 id="maintenance-title" className="mb-3 text-lg font-semibold">
        {t.maintenance.title}
      </h2>
      {alerts.length > 0 ? (
        <div className="flex flex-col gap-3">
          {alerts.map((item) => (
            <MaintenanceItemCard key={item.typeCode} item={item} actions={actions(item)} />
          ))}
        </div>
      ) : (
        <div className="rounded-card border border-border bg-surface p-4">
          <p className="font-semibold text-success">{t.maintenance.allGood}</p>
          {next !== undefined && (
            <p className="mt-1 text-text-muted">
              {t.maintenance.next(
                t.maintenance.names[next.typeCode],
                next.estimatedDueAt !== null ? t.maintenance.around(formatDate(next.estimatedDueAt)) : t.maintenance.noDate,
              )}
            </p>
          )}
        </div>
      )}
      <Link
        to={`/vehicles/${vehicle.id}/maintenance`}
        className="mt-3 inline-flex min-h-tap items-center font-semibold text-primary"
      >
        {t.maintenance.seeAll} →
      </Link>
      {sheets.sheets}
    </section>
  );
}
