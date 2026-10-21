import type { MaintenanceItemDto } from '@car-checkup/shared/dto';
import { parseKmInput } from '@car-checkup/shared/validation';
import { type SyntheticEvent, useState } from 'react';
import { Button, Sheet, TextField } from '../../design/components';
import { fieldMessage, messageForError, t } from '../../i18n/es';
import { ApiRequestError } from '../../lib/api';
import { monthToDate, toDateInputValue } from '../../lib/format';
import { useUpdateMaintenanceSetting } from './api';

/** "¿Cuándo se hizo por última vez?" (US3, FR-016). */
export function PriorHistorySheet({
  vehicleId,
  item,
  onClose,
}: {
  vehicleId: string;
  item: MaintenanceItemDto | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t.maintenance.prior.title}
      description={item !== null ? t.maintenance.names[item.typeCode] : undefined}
    >
      {item !== null && <PriorHistoryForm vehicleId={vehicleId} item={item} onDone={onClose} />}
    </Sheet>
  );
}

function PriorHistoryForm({ vehicleId, item, onDone }: { vehicleId: string; item: MaintenanceItemDto; onDone: () => void }) {
  const p = t.maintenance.prior;
  const update = useUpdateMaintenanceSetting(vehicleId);
  const [month, setMonth] = useState('');
  const [kmText, setKmText] = useState('');
  const [error, setError] = useState<string | undefined>();
  const currentMonth = toDateInputValue(new Date()).slice(0, 7);

  function send(priorHistory: { km?: number; date?: string } | 'UNKNOWN') {
    update.mutate(
      { typeCode: item.typeCode, input: { priorHistory } },
      {
        onSuccess: onDone,
        onError: (err) => {
          const fields = err instanceof ApiRequestError ? err.body?.error.fields : undefined;
          if (fields?.['priorHistory.km'] !== undefined) setError('Ese kilometraje es mayor que el actual del vehículo.');
          else if (fields?.['priorHistory.date'] !== undefined) setError(fieldMessage('readAt', 'future'));
          else setError(messageForError(err instanceof ApiRequestError ? err.body?.error.code : 'NETWORK'));
        },
      },
    );
  }

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const km = kmText.trim() === '' ? null : parseKmInput(kmText);
    if (kmText.trim() !== '' && km === null) {
      setError(fieldMessage('odometerKm', 'invalid_type'));
      return;
    }
    if (month === '' && km === null) {
      setError(p.needOne);
      return;
    }
    send({ ...(month !== '' && { date: monthToDate(month) }), ...(km !== null && { km }) });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-text-muted">{p.intro}</p>
      <TextField
        label={p.month}
        type="month"
        max={currentMonth}
        value={month}
        onChange={(e) => {
          setMonth(e.target.value);
        }}
      />
      <TextField
        label={p.km}
        inputMode="numeric"
        suffix="km"
        value={kmText}
        onChange={(e) => {
          setKmText(e.target.value);
        }}
        error={error}
      />
      <Button type="submit" size="lg" block loading={update.isPending}>
        {p.save}
      </Button>
      <Button
        variant="ghost"
        block
        onClick={() => {
          send('UNKNOWN');
        }}
      >
        {p.unknown}
      </Button>
    </form>
  );
}
