import type { ServiceRecordDto } from '@car-checkup/shared/dto';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Banner, Button, Skeleton } from '../../design/components';
import { t } from '../../i18n/es';
import { formatDate, formatKm } from '../../lib/format';
import { useVehicleMaintenance } from '../maintenance/api';
import { RecordServiceSheet } from '../maintenance/RecordServiceSheet';
import { useVehicle } from '../vehicles/api';
import { vehicleTitle } from '../vehicles/VehicleSwitcher';
import { useServicesInfinite } from './api';

/** Service history newest first; tap to correct or delete (FR-014). */
export function ServicesHistoryPage() {
  const { id = '' } = useParams();
  const vehicle = useVehicle(id);
  const maintenance = useVehicleMaintenance(id);
  const services = useServicesInfinite(id);
  const [editing, setEditing] = useState<ServiceRecordDto | null>(null);
  const items = services.data?.pages.flatMap((p) => p.items) ?? [];
  const typeCodes = (maintenance.data?.items ?? []).filter((i) => i.enabled).map((i) => i.typeCode);

  return (
    <section>
      <Link to={`/vehicles/${id}/maintenance`} className="inline-flex min-h-tap items-center text-primary">
        ← {t.common.back}
      </Link>
      <h1 className="text-2xl font-bold">{t.maintenance.servicesPage.title}</h1>
      {vehicle.data !== undefined && <p className="text-text-muted">{vehicleTitle(vehicle.data)}</p>}

      {services.isPending ? (
        <Skeleton className="mt-4 h-40" />
      ) : services.isError ? (
        <Banner tone="danger">{t.common.loadError}</Banner>
      ) : items.length === 0 ? (
        <p className="mt-4 text-text-muted">{t.maintenance.servicesPage.empty}</p>
      ) : (
        <ol className="mt-4 flex flex-col gap-2">
          {items.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  setEditing(s);
                }}
                className="flex w-full items-center justify-between rounded-card border border-border bg-surface px-4 py-3 text-left"
              >
                <div>
                  <p className="font-semibold">{s.typeCodes.map((c) => t.maintenance.names[c]).join(', ')}</p>
                  <p className="text-sm text-text-muted">
                    {formatDate(s.performedAt)} · {formatKm(s.odometerKm)}
                  </p>
                  {s.notes !== null && <p className="text-sm">{s.notes}</p>}
                  {s.createdReading && <p className="text-sm text-text-muted">{t.maintenance.servicesPage.createdReading}</p>}
                </div>
                <span aria-hidden className="text-2xl text-text-muted">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {services.hasNextPage && (
        <Button variant="secondary" block className="mt-4" loading={services.isFetchingNextPage} onClick={() => void services.fetchNextPage()}>
          {t.history.loadMore}
        </Button>
      )}
      {vehicle.data !== undefined && (
        <RecordServiceSheet
          vehicle={vehicle.data}
          typeCodes={typeCodes}
          target={editing !== null ? { mode: 'edit', service: editing } : null}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}
