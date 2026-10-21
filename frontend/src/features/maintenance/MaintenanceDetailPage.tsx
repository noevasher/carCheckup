import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Banner, Button, Skeleton } from '../../design/components';
import { t } from '../../i18n/es';
import { useVehicle } from '../vehicles/api';
import { vehicleTitle } from '../vehicles/VehicleSwitcher';
import { useUpdateMaintenanceSetting, useVehicleMaintenance } from './api';
import { MaintenanceItemCard } from './MaintenanceItemCard';
import { useMaintenanceSheets } from './useMaintenanceSheets';

/** All applicable maintenance of a vehicle (FR-009) with actions and disabled items (US4). */
export function MaintenanceDetailPage() {
  const { id = '' } = useParams();
  const vehicle = useVehicle(id);
  if (vehicle.isPending) return <Skeleton className="h-96" />;
  if (vehicle.isError) return <Banner tone="danger">{t.common.loadError}</Banner>;
  return <Detail vehicle={vehicle.data} />;
}

function Detail({ vehicle }: { vehicle: NonNullable<ReturnType<typeof useVehicle>['data']> }) {
  const maintenance = useVehicleMaintenance(vehicle.id);
  const setting = useUpdateMaintenanceSetting(vehicle.id);
  const sheets = useMaintenanceSheets(vehicle, maintenance.data);
  const [showDisabled, setShowDisabled] = useState(false);

  const enabled = maintenance.data?.items.filter((i) => i.enabled) ?? [];
  const disabled = maintenance.data?.items.filter((i) => !i.enabled) ?? [];

  return (
    <section>
      <Link to="/" className="inline-flex min-h-tap items-center text-primary">
        ← {t.common.back}
      </Link>
      <h1 className="text-2xl font-bold">{t.maintenance.allTitle}</h1>
      <p className="text-text-muted">{vehicleTitle(vehicle)}</p>
      <Link to={`/vehicles/${vehicle.id}/services`} className="mt-2 inline-flex min-h-tap items-center font-semibold text-primary">
        {t.maintenance.services} →
      </Link>

      {maintenance.isPending ? (
        <Skeleton className="mt-4 h-64" />
      ) : maintenance.data === undefined ? (
        <Banner tone="danger">{t.common.loadError}</Banner>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {enabled.map((item) => (
            <MaintenanceItemCard
              key={item.typeCode}
              item={item}
              actions={
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
                    onClick={() => {
                      sheets.explain(item);
                    }}
                  >
                    {t.maintenance.why}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      sheets.adjust(item);
                    }}
                  >
                    {t.maintenance.adjust}
                  </Button>
                  {item.askHistory && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        sheets.askHistory(item);
                      }}
                    >
                      {t.maintenance.askHistory}
                    </Button>
                  )}
                </>
              }
            />
          ))}

          {disabled.length > 0 && (
            <div className="rounded-card border border-border">
              <button
                type="button"
                aria-expanded={showDisabled}
                onClick={() => {
                  setShowDisabled((v) => !v);
                }}
                className="flex min-h-tap w-full items-center justify-between px-4 font-medium"
              >
                {t.maintenance.disabledTitle} ({disabled.length})
                <span aria-hidden>{showDisabled ? '−' : '+'}</span>
              </button>
              {showDisabled && (
                <ul className="flex flex-col gap-2 border-t border-border p-4">
                  {disabled.map((item) => (
                    <li key={item.typeCode} className="flex items-center justify-between gap-2">
                      <span>{t.maintenance.names[item.typeCode]}</span>
                      <Button
                        variant="secondary"
                        loading={setting.isPending && setting.variables.typeCode === item.typeCode}
                        onClick={() => {
                          setting.mutate({ typeCode: item.typeCode, input: { enabled: true } });
                        }}
                      >
                        {t.maintenance.enable}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <p className="text-sm text-text-muted">{t.maintenance.disclaimer}</p>
        </div>
      )}
      {sheets.sheets}
    </section>
  );
}
