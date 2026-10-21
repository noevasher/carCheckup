import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import { Banner, Button, Skeleton } from '../../design/components';
import { messageForError, t } from '../../i18n/es';
import { ApiRequestError } from '../../lib/api';
import { useAuth } from '../auth/AuthProvider';
import { formatKm, formatRelativeDay } from '../../lib/format';
import { usePendingReadings } from '../../offline/sync';
import { MaintenanceAlerts } from '../maintenance/MaintenanceAlerts';
import { QuickCaptureSheet } from '../readings/QuickCaptureSheet';
import { useVehicles } from '../vehicles/api';
import { useActiveVehicle } from '../vehicles/useActiveVehicle';
import { vehicleTitle, VehicleSwitcher } from '../vehicles/VehicleSwitcher';

/** Home: active vehicle, current km and the one-tap "Actualizar km" action (FR-005, FR-016). */
export function HomePage() {
  const { signOut } = useAuth();
  const vehicles = useVehicles();
  const { active, setActive } = useActiveVehicle(vehicles.data);
  const pending = usePendingReadings(active?.id);
  const [captureOpen, setCaptureOpen] = useState(false);

  if (vehicles.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy>
        <Skeleton className="h-11 w-2/3" />
        <Skeleton className="h-56" />
      </div>
    );
  }
  // With cached data (e.g. offline), keep showing it even if the refresh failed.
  if (vehicles.data === undefined) {
    const { error } = vehicles;
    const sessionRejected = error instanceof ApiRequestError && error.status === 401;
    return (
      <Banner
        tone="danger"
        action={
          sessionRejected ? (
            <Button variant="secondary" onClick={() => void signOut()}>
              {t.common.signInAgain}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => void vehicles.refetch()}>
              {t.common.retry}
            </Button>
          )
        }
      >
        {error instanceof ApiRequestError ? messageForError(error.body?.error.code) : t.common.loadError}
      </Banner>
    );
  }
  if (vehicles.data.length === 0 || active === undefined) return <Navigate to="/vehicles/new" replace />;

  // Readings still queued on the device are shown immediately (offline capture, FR-010).
  const latestPending = pending.find((p) => p.readAt >= active.lastReadingAt);
  const shownKm = latestPending?.odometerKm ?? active.currentOdometerKm;
  const shownDate = latestPending?.readAt ?? active.lastReadingAt;

  return (
    <>
      <VehicleSwitcher vehicles={vehicles.data} activeId={active.id} onSelect={setActive} />

      {active.pendingReviewCount > 0 && (
        <Banner
          tone="warning"
          className="mb-4"
          action={
            <Link to={`/vehicles/${active.id}/history?review=1`} className="inline-flex min-h-tap items-center font-semibold underline">
              {t.home.reviewAction}
            </Link>
          }
        >
          {t.home.review(active.pendingReviewCount)}
        </Banner>
      )}

      <article className="rounded-card border border-border bg-surface p-5 shadow-sm" aria-labelledby="active-vehicle-title">
        <h1 id="active-vehicle-title" className="text-xl font-semibold">
          {vehicleTitle(active)}
        </h1>
        <p className="text-text-muted">
          {active.nickname !== null ? `${active.make} ${active.model} · ` : ''}
          {active.year}
        </p>

        <p className="mt-5 text-4xl font-bold tracking-tight tabular-nums" aria-live="polite">
          {formatKm(shownKm)}
        </p>
        <p className="mt-1 text-text-muted">{t.home.lastReading(formatRelativeDay(shownDate))}</p>
        {pending.length > 0 && (
          <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-info-bg px-3 py-1 text-sm font-medium" title={t.home.pendingSyncHint}>
            <span aria-hidden className="size-2 rounded-full bg-warning" />
            {t.home.pendingSync}
          </p>
        )}

        <Button
          size="lg"
          block
          className="mt-6"
          onClick={() => {
            setCaptureOpen(true);
          }}
        >
          {t.home.updateKm}
        </Button>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link
            to={`/vehicles/${active.id}/history`}
            className="inline-flex min-h-tap items-center justify-center rounded-xl border border-border font-semibold text-primary"
          >
            {t.home.history}
          </Link>
          <Link
            to={`/vehicles/${active.id}/edit`}
            className="inline-flex min-h-tap items-center justify-center rounded-xl border border-border font-semibold text-primary"
          >
            {t.home.edit}
          </Link>
        </div>
      </article>

      <MaintenanceAlerts key={active.id} vehicle={active} />

      <QuickCaptureSheet vehicle={active} open={captureOpen} onOpenChange={setCaptureOpen} />
    </>
  );
}
