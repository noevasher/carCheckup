import type { MaintenanceTypeCode, ServiceRecordDto, VehicleDto } from '@car-checkup/shared/dto';
import { parseKmInput } from '@car-checkup/shared/validation';
import { type SyntheticEvent, useEffect, useState } from 'react';
import { Banner, Button, ConfirmDialog, Sheet, TextField } from '../../design/components';
import { cx } from '../../design/cx';
import { fieldMessage, messageForError, outOfOrderMessage, t } from '../../i18n/es';
import { ApiRequestError, NetworkError } from '../../lib/api';
import { dateInputToIso, toDateInputValue } from '../../lib/format';
import { pushNotice } from '../../offline/notices';
import { useCreateService, useDeleteService, useUpdateService } from '../services/api';

export type RecordServiceTarget =
  | { mode: 'create'; typeCode: MaintenanceTypeCode }
  | { mode: 'edit'; service: ServiceRecordDto };

interface Props {
  vehicle: VehicleDto;
  /** Enabled maintenance types of the vehicle, in display order. */
  typeCodes: readonly MaintenanceTypeCode[];
  target: RecordServiceTarget | null;
  onClose: () => void;
}

/**
 * "Ya lo hice" (US2): opened from an alert with today's date and the current odometer, so the
 * main flow is 2 taps (FR-010). Offline, the form is kept and retried with the same id.
 */
export function RecordServiceSheet({ vehicle, typeCodes, target, onClose }: Props) {
  return (
    <Sheet
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={target?.mode === 'edit' ? t.maintenance.record.editTitle : t.maintenance.record.title}
    >
      {target !== null && <RecordServiceForm vehicle={vehicle} typeCodes={typeCodes} target={target} onDone={onClose} />}
    </Sheet>
  );
}

function RecordServiceForm({
  vehicle,
  typeCodes,
  target,
  onDone,
}: {
  vehicle: VehicleDto;
  typeCodes: readonly MaintenanceTypeCode[];
  target: RecordServiceTarget;
  onDone: () => void;
}) {
  const r = t.maintenance.record;
  const create = useCreateService(vehicle.id);
  const update = useUpdateService(vehicle.id);
  const remove = useDeleteService(vehicle.id);
  const editing = target.mode === 'edit' ? target.service : null;
  const today = toDateInputValue(new Date());

  // Generated once per sheet so retries are idempotent.
  const [id] = useState(() => crypto.randomUUID());
  const [selected, setSelected] = useState<MaintenanceTypeCode[]>(
    editing !== null ? editing.typeCodes : target.mode === 'create' ? [target.typeCode] : [],
  );
  const [date, setDate] = useState(editing !== null ? toDateInputValue(new Date(editing.performedAt)) : today);
  const [showDate, setShowDate] = useState(editing !== null);
  const [kmText, setKmText] = useState(String(editing?.odometerKm ?? vehicle.currentOdometerKm));
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [error, setError] = useState<string | undefined>();
  const [offline, setOffline] = useState(false);
  const [confirmUnusual, setConfirmUnusual] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Without connection TanStack pauses the mutation and resumes it when back online (same id).
  const paused = create.isPaused || update.isPaused;
  const saving = (create.isPending || update.isPending) && !paused;

  // The tapped maintenance is preselected; the rest stay collapsed so "Guardar" is in view (FR-010).
  const [showOthers, setShowOthers] = useState(false);

  function toggle(code: MaintenanceTypeCode) {
    setSelected((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code]));
  }

  function save(confirmedUnusual: boolean) {
    const odometerKm = parseKmInput(kmText);
    if (odometerKm === null) {
      setError(fieldMessage('odometerKm', 'invalid_type'));
      return;
    }
    if (selected.length === 0) return;
    setError(undefined);
    const performedAt =
      editing !== null && date === toDateInputValue(new Date(editing.performedAt)) ? editing.performedAt : dateInputToIso(date);
    const onError = (err: Error) => {
      if (err instanceof NetworkError) {
        setOffline(true);
        return;
      }
      const body = err instanceof ApiRequestError ? err.body?.error : undefined;
      if (body?.code === 'UNUSUAL_DISTANCE') setConfirmUnusual(true);
      else if (body?.code === 'READING_OUT_OF_ORDER' && body.validRange !== undefined) setError(outOfOrderMessage(body.validRange));
      else if (body?.fields?.['performedAt'] !== undefined) setError(fieldMessage('readAt', body.fields['performedAt']));
      else setError(messageForError(body?.code));
    };
    const onSuccess = () => {
      setOffline(false);
      pushNotice({ tone: 'success', text: r.saved, autoDismissMs: 3000 });
      onDone();
    };
    const note = notes.trim() === '' ? null : notes.trim();
    if (editing !== null) {
      update.mutate(
        { serviceId: editing.id, input: { performedAt, odometerKm, typeCodes: selected, notes: note, confirmedUnusual } },
        { onSuccess, onError },
      );
    } else {
      create.mutate({ id, performedAt, odometerKm, typeCodes: selected, notes: note, confirmedUnusual }, { onSuccess, onError });
    }
  }

  // Offline: retry automatically when the connection comes back (same id → no duplicates).
  useEffect(() => {
    if (!offline) return;
    const retry = () => {
      save(false);
    };
    window.addEventListener('online', retry);
    return () => {
      window.removeEventListener('online', retry);
    };
  });

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    save(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <fieldset>
        <legend className="mb-1.5 font-medium">{t.maintenance.title}</legend>
        <div className="flex flex-wrap gap-2">
          {(showOthers ? typeCodes : selected).map((code) => {
            const on = selected.includes(code);
            return (
              <button
                key={code}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  toggle(code);
                }}
                className={cx(
                  'min-h-tap rounded-full border px-4 text-left font-medium',
                  on ? 'border-primary bg-primary text-on-primary' : 'border-border bg-surface',
                )}
              >
                {t.maintenance.names[code]}
              </button>
            );
          })}
        </div>
        {!showOthers && (
          <button
            type="button"
            className="mt-2 min-h-tap text-primary underline"
            onClick={() => {
              setShowOthers(true);
            }}
          >
            + {t.maintenance.addOther}
          </button>
        )}
      </fieldset>

      {showDate ? (
        <TextField
          label={r.date}
          type="date"
          max={today}
          value={date}
          onChange={(e) => {
            setDate(e.target.value === '' ? today : e.target.value);
          }}
        />
      ) : (
        <button
          type="button"
          className="min-h-tap self-start text-primary underline"
          onClick={() => {
            setShowDate(true);
          }}
        >
          {r.today} · {r.otherDay}
        </button>
      )}

      <TextField
        label={r.km}
        inputMode="numeric"
        suffix="km"
        value={kmText}
        onChange={(e) => {
          setKmText(e.target.value);
        }}
        hint={r.kmHint}
        error={error}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="service-notes" className="font-medium">
          {r.notes}
        </label>
        <textarea
          id="service-notes"
          maxLength={500}
          rows={2}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
          className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-base"
        />
      </div>

      {(offline || paused) && (
        <Banner
          tone="warning"
          action={
            <Button
              variant="secondary"
              loading={saving}
              onClick={() => {
                save(false);
              }}
            >
              {r.retry}
            </Button>
          }
        >
          {r.offline}
        </Banner>
      )}

      <Button type="submit" size="lg" block loading={saving} disabled={selected.length === 0}>
        {r.save}
      </Button>
      {editing !== null && (
        <Button
          variant="danger"
          block
          onClick={() => {
            setConfirmDelete(true);
          }}
        >
          {r.delete}
        </Button>
      )}

      <ConfirmDialog
        open={confirmUnusual}
        onOpenChange={setConfirmUnusual}
        title={t.capture.unusualTitle}
        description={messageForError('UNUSUAL_DISTANCE')}
        confirmLabel={t.capture.unusualConfirm}
        cancelLabel={t.capture.unusualCancel}
        loading={saving}
        onConfirm={() => {
          setConfirmUnusual(false);
          save(true);
        }}
      />
      {editing !== null && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={r.deleteTitle}
          description={r.deleteBody}
          confirmLabel={t.history.deleteConfirm}
          tone="danger"
          loading={remove.isPending}
          onConfirm={() => {
            remove.mutate(editing.id, { onSuccess: onDone });
          }}
        />
      )}
    </form>
  );
}
