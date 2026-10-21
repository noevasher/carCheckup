import type { MileageReadingDto, VehicleDto } from '@car-checkup/shared/dto';
import type { ValidRange } from '@car-checkup/shared/errors';
import { parseKmInput } from '@car-checkup/shared/validation';
import { type SyntheticEvent, useState } from 'react';
import { Banner, Button, ConfirmDialog, Sheet, TextField } from '../../design/components';
import { daysLabel, fieldMessage, messageForError, outOfOrderMessage, t } from '../../i18n/es';
import { ApiRequestError } from '../../lib/api';
import { dateInputToIso, formatKm, formatRelativeDay, toDateInputValue } from '../../lib/format';
import { pushNotice } from '../../offline/notices';
import { fetchLatestReading, useUpdateReading } from './api';
import { useCaptureReading } from './useCaptureReading';

interface Props {
  vehicle: VehicleDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Quick mileage capture (US2). Main flow = 2 taps: "Actualizar km" → type value → "Guardar"
 * (FR-006). The field opens focused with the numeric keyboard; the date is optional (FR-007).
 */
export function QuickCaptureSheet({ vehicle, open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t.capture.title}>
      {open && (
        <CaptureForm
          vehicle={vehicle}
          onDone={() => {
            onOpenChange(false);
          }}
        />
      )}
    </Sheet>
  );
}

function CaptureForm({ vehicle, onDone }: { vehicle: VehicleDto; onDone: () => void }) {
  const capture = useCaptureReading(vehicle);
  const updateReading = useUpdateReading(vehicle.id);
  const today = toDateInputValue(new Date());
  const [kmText, setKmText] = useState('');
  const [showDate, setShowDate] = useState(false);
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | undefined>();
  const [range, setRange] = useState<ValidRange | null>(null);
  const [unusual, setUnusual] = useState<{ distanceKm: number; days: number } | null>(null);
  const [correcting, setCorrecting] = useState<MileageReadingDto | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(confirmedUnusual: boolean) {
    const odometerKm = parseKmInput(kmText);
    if (odometerKm === null) {
      setError(fieldMessage('odometerKm', 'invalid_type'));
      return;
    }
    setError(undefined);
    setRange(null);
    setSaving(true);
    try {
      if (correcting !== null) await saveCorrection(correcting, odometerKm, confirmedUnusual);
      else await saveNew(odometerKm, confirmedUnusual);
    } finally {
      setSaving(false);
    }
  }

  async function saveNew(odometerKm: number, confirmedUnusual: boolean) {
    const result = await capture({ odometerKm, readAt: dateInputToIso(date), confirmedUnusual });
    switch (result.status) {
      case 'saved':
        pushNotice({ tone: 'success', text: t.capture.saved, autoDismissMs: 3000 });
        onDone();
        return;
      case 'pending':
        pushNotice({ tone: 'info', text: t.capture.savedOffline, autoDismissMs: 5000 });
        onDone();
        return;
      case 'needs_review':
        pushNotice({
          tone: 'warning',
          text: t.capture.savedNeedsReview,
          action: { label: t.home.reviewAction, to: `/vehicles/${vehicle.id}/history?review=1` },
        });
        onDone();
        return;
      case 'out_of_order':
        setRange(result.validRange);
        setError(outOfOrderMessage(result.validRange));
        return;
      case 'confirm_unusual':
        setUnusual({ distanceKm: result.distanceKm, days: result.days });
        return;
      case 'error':
        setError(result.message);
    }
  }

  async function saveCorrection(reading: MileageReadingDto, odometerKm: number, confirmedUnusual: boolean) {
    try {
      await updateReading.mutateAsync({ readingId: reading.id, input: { odometerKm, confirmedUnusual } });
      pushNotice({ tone: 'success', text: t.capture.saved, autoDismissMs: 3000 });
      onDone();
    } catch (err) {
      const body = err instanceof ApiRequestError ? err.body?.error : undefined;
      if (body?.code === 'UNUSUAL_DISTANCE') setUnusual({ distanceKm: odometerKm - reading.odometerKm, days: 1 });
      else setError(messageForError(err instanceof ApiRequestError ? body?.code : 'NETWORK', body?.validRange));
    }
  }

  async function startCorrection() {
    try {
      const latest = await fetchLatestReading(vehicle.id);
      if (latest !== undefined) {
        setCorrecting(latest);
        setError(undefined);
        setRange(null);
      }
    } catch {
      setError(messageForError('NETWORK'));
    }
  }

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    void save(false);
  }

  // Offer to fix the latest reading when the new value is lower than it (US2-3).
  const canCorrectLast = range !== null && range.maxKm === null && correcting === null && date === today;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {correcting !== null && (
        <Banner tone="info">{t.capture.correctingLast(formatKm(correcting.odometerKm))}</Banner>
      )}
      <TextField
        label={t.capture.km}
        inputMode="numeric"
        pattern="[0-9.,\s]*"
        enterKeyHint="done"
        autoComplete="off"
        autoFocus
        suffix="km"
        className="text-xl"
        value={kmText}
        onChange={(e) => {
          setKmText(e.target.value);
        }}
        hint={t.capture.reference(formatKm(vehicle.currentOdometerKm), formatRelativeDay(vehicle.lastReadingAt))}
        error={error}
      />
      {canCorrectLast && (
        <Button variant="secondary" onClick={() => void startCorrection()}>
          {t.capture.correctLast}
        </Button>
      )}

      {correcting === null &&
        (showDate ? (
          <div className="flex items-end gap-2">
            <TextField
              label={t.capture.date}
              type="date"
              max={today}
              value={date}
              className="flex-1"
              onChange={(e) => {
                setDate(e.target.value === '' ? today : e.target.value);
              }}
            />
            <Button
              variant="ghost"
              onClick={() => {
                setDate(today);
                setShowDate(false);
              }}
            >
              {t.capture.today}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            className="self-start text-primary underline min-h-tap"
            onClick={() => {
              setShowDate(true);
            }}
          >
            {t.capture.changeDate}
          </button>
        ))}

      <Button type="submit" size="lg" block loading={saving}>
        {correcting !== null ? t.capture.correctSave : t.capture.save}
      </Button>

      <ConfirmDialog
        open={unusual !== null}
        onOpenChange={(o) => {
          if (!o) setUnusual(null);
        }}
        title={t.capture.unusualTitle}
        description={
          unusual !== null ? t.capture.unusualBody(formatKm(unusual.distanceKm), daysLabel(unusual.days)) : ''
        }
        confirmLabel={t.capture.unusualConfirm}
        cancelLabel={t.capture.unusualCancel}
        loading={saving}
        onConfirm={() => {
          setUnusual(null);
          void save(true);
        }}
      />
    </form>
  );
}
