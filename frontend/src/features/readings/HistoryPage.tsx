import type { MileageReadingDto } from '@car-checkup/shared/dto';
import { parseKmInput } from '@car-checkup/shared/validation';
import { type SyntheticEvent, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Banner, Button, ConfirmDialog, Sheet, Skeleton, TextField } from '../../design/components';
import { cx } from '../../design/cx';
import { fieldMessage, messageForError, t } from '../../i18n/es';
import { ApiRequestError } from '../../lib/api';
import { dateInputToIso, formatDate, formatKm, toDateInputValue } from '../../lib/format';
import { usePendingReadings } from '../../offline/sync';
import { useVehicle } from '../vehicles/api';
import { vehicleTitle } from '../vehicles/VehicleSwitcher';
import { useDeleteReading, useReadingsInfinite, useUpdateReading } from './api';

/** Mileage history newest first, with pending and review states (US4, FR-012). */
export function HistoryPage() {
  const { id = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const reviewOnly = searchParams.get('review') === '1';
  const vehicle = useVehicle(id);
  const readings = useReadingsInfinite(id, reviewOnly);
  const pending = usePendingReadings(id);
  const [editing, setEditing] = useState<MileageReadingDto | null>(null);
  const items = readings.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <section>
      <Link to="/" className="inline-flex min-h-tap items-center text-primary">
        ← {t.common.back}
      </Link>
      <h1 className="text-2xl font-bold">{t.history.title}</h1>
      {vehicle.data !== undefined && <p className="text-text-muted">{vehicleTitle(vehicle.data)}</p>}

      <div className="mt-3 mb-4">
        <Button
          variant="secondary"
          onClick={() => {
            setSearchParams(reviewOnly ? {} : { review: '1' }, { replace: true });
          }}
        >
          {reviewOnly ? t.history.all : t.history.onlyReview}
        </Button>
      </div>

      {readings.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : readings.isError ? (
        <Banner tone="danger">{t.common.loadError}</Banner>
      ) : (
        <ol className="flex flex-col gap-2">
          {!reviewOnly &&
            pending.map((p) => (
              <li key={p.id} className="flex min-h-16 items-center justify-between rounded-card border border-dashed border-border bg-surface px-4">
                <div>
                  <p className="font-semibold">{formatKm(p.odometerKm)}</p>
                  <p className="text-sm text-text-muted">{formatDate(p.readAt)}</p>
                </div>
                <span className="rounded-full bg-info-bg px-3 py-1 text-sm font-medium">{t.history.pending}</span>
              </li>
            ))}
          {items.length === 0 && pending.length === 0 && <p className="text-text-muted">{t.history.empty}</p>}
          {items.map((r) => {
            const review = r.reviewStatus === 'NEEDS_REVIEW';
            return (
              <li key={r.id}>
                <button
                  type="button"
                  aria-label={`${formatKm(r.odometerKm)}, ${formatDate(r.readAt)}. ${t.history.editTitle}`}
                  onClick={() => {
                    setEditing(r);
                  }}
                  className={cx(
                    'flex min-h-16 w-full items-center justify-between rounded-card border bg-surface px-4 py-2 text-left',
                    review ? 'border-warning' : 'border-border',
                  )}
                >
                  <div>
                    <p className="font-semibold">{formatKm(r.odometerKm)}</p>
                    <p className="text-sm text-text-muted">
                      {formatDate(r.readAt)}
                      {r.source === 'INITIAL' && ` · ${t.history.initial}`}
                    </p>
                    {review && <p className="mt-1 text-sm text-warning">{t.history.needsReviewHint}</p>}
                  </div>
                  <span className="ml-2 flex shrink-0 items-center gap-2">
                    {review && (
                      <span className="rounded-full bg-warning-bg px-3 py-1 text-sm font-medium text-warning">
                        {t.history.needsReview}
                      </span>
                    )}
                    <span aria-hidden className="text-2xl text-text-muted">
                      ›
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {readings.hasNextPage && (
        <Button
          variant="secondary"
          block
          className="mt-4"
          loading={readings.isFetchingNextPage}
          onClick={() => void readings.fetchNextPage()}
        >
          {t.history.loadMore}
        </Button>
      )}

      <Sheet
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        title={t.history.editTitle}
      >
        {editing !== null && (
          <ReadingEditForm
            vehicleId={id}
            reading={editing}
            onDone={() => {
              setEditing(null);
            }}
          />
        )}
      </Sheet>
    </section>
  );
}

function ReadingEditForm({
  vehicleId,
  reading,
  onDone,
}: {
  vehicleId: string;
  reading: MileageReadingDto;
  onDone: () => void;
}) {
  const update = useUpdateReading(vehicleId);
  const remove = useDeleteReading(vehicleId);
  const today = toDateInputValue(new Date());
  const [kmText, setKmText] = useState(String(reading.odometerKm));
  const [date, setDate] = useState(toDateInputValue(new Date(reading.readAt)));
  const [error, setError] = useState<string | undefined>();
  const [confirmUnusual, setConfirmUnusual] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const describe = (err: unknown): string => {
    const body = err instanceof ApiRequestError ? err.body?.error : undefined;
    return messageForError(err instanceof ApiRequestError ? body?.code : 'NETWORK', body?.validRange);
  };

  function save(confirmedUnusual: boolean) {
    const odometerKm = parseKmInput(kmText);
    if (odometerKm === null) {
      setError(fieldMessage('odometerKm', 'invalid_type'));
      return;
    }
    const sameDay = date === toDateInputValue(new Date(reading.readAt));
    update.mutate(
      {
        readingId: reading.id,
        input: { odometerKm, confirmedUnusual, ...(!sameDay && { readAt: dateInputToIso(date) }) },
      },
      {
        onSuccess: onDone,
        onError: (err) => {
          if (err instanceof ApiRequestError && err.code === 'UNUSUAL_DISTANCE') setConfirmUnusual(true);
          else setError(describe(err));
        },
      },
    );
  }

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setError(undefined);
    save(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <TextField
        label={t.capture.km}
        inputMode="numeric"
        suffix="km"
        value={kmText}
        onChange={(e) => {
          setKmText(e.target.value);
        }}
        error={error}
      />
      <TextField
        label={t.capture.date}
        type="date"
        max={today}
        value={date}
        onChange={(e) => {
          setDate(e.target.value === '' ? today : e.target.value);
        }}
      />
      <Button type="submit" size="lg" block loading={update.isPending}>
        {t.history.save}
      </Button>
      <Button
        variant="danger"
        block
        onClick={() => {
          setConfirmDelete(true);
        }}
      >
        {t.history.delete}
      </Button>

      <ConfirmDialog
        open={confirmUnusual}
        onOpenChange={setConfirmUnusual}
        title={t.capture.unusualTitle}
        description={messageForError('UNUSUAL_DISTANCE')}
        confirmLabel={t.capture.unusualConfirm}
        cancelLabel={t.capture.unusualCancel}
        loading={update.isPending}
        onConfirm={() => {
          setConfirmUnusual(false);
          save(true);
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t.history.deleteTitle}
        description={
          <>
            <p>{t.history.deleteBody}</p>
            {remove.isError && <p className="mt-2 font-medium text-danger">{describe(remove.error)}</p>}
          </>
        }
        confirmLabel={t.history.deleteConfirm}
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => {
          remove.mutate(reading.id, { onSuccess: onDone });
        }}
      />
    </form>
  );
}
