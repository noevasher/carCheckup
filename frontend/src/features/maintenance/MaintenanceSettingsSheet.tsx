import type { MaintenanceItemDto } from '@car-checkup/shared/dto';
import { MaintenanceSettingUpdateSchema } from '@car-checkup/shared/schemas';
import { type SyntheticEvent, useState } from 'react';
import { Button, Sheet, TextField } from '../../design/components';
import { messageForError, t } from '../../i18n/es';
import { ApiRequestError } from '../../lib/api';
import { formatKm } from '../../lib/format';
import { useUpdateMaintenanceSetting } from './api';
import { describeInterval } from './explain';

/** Custom interval, reset and "No aplica a mi vehículo" (US4, FR-018). */
export function MaintenanceSettingsSheet({
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
      title={item !== null ? t.maintenance.settings.title(t.maintenance.names[item.typeCode]) : ''}
    >
      {item !== null && <SettingsForm vehicleId={vehicleId} item={item} onDone={onClose} />}
    </Sheet>
  );
}

const toInt = (text: string): number | null | 'invalid' => {
  const clean = text.replace(/[.\s,]/g, '');
  if (clean === '') return null;
  return /^\d+$/.test(clean) ? Number(clean) : 'invalid';
};

function SettingsForm({ vehicleId, item, onDone }: { vehicleId: string; item: MaintenanceItemDto; onDone: () => void }) {
  const s = t.maintenance.settings;
  const update = useUpdateMaintenanceSetting(vehicleId);
  const [kmText, setKmText] = useState(item.interval.km === null ? '' : String(item.interval.km));
  const [monthsText, setMonthsText] = useState(item.interval.months === null ? '' : String(item.interval.months));
  const [errors, setErrors] = useState<{ km?: string; months?: string; form?: string }>({});

  const send = (input: Parameters<typeof update.mutate>[0]['input']) => {
    update.mutate(
      { typeCode: item.typeCode, input },
      {
        onSuccess: onDone,
        onError: (err) => {
          setErrors({ form: messageForError(err instanceof ApiRequestError ? err.body?.error.code : 'NETWORK') });
        },
      },
    );
  };

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const km = toInt(kmText);
    const months = toInt(monthsText);
    const input = { customIntervalKm: km === 'invalid' ? -1 : km, customIntervalMonths: months === 'invalid' ? -1 : months };
    const parsed = MaintenanceSettingUpdateSchema.safeParse(input);
    if (!parsed.success || (km === null && months === null)) {
      const next: { km?: string; months?: string } = {};
      for (const issue of parsed.success ? [] : parsed.error.issues) {
        if (issue.path[0] === 'customIntervalKm') next.km = s.kmRange;
        if (issue.path[0] === 'customIntervalMonths') next.months = s.monthsRange;
      }
      if (km === null && months === null) next.km = s.kmRange;
      setErrors(next);
      return;
    }
    send(parsed.data);
  }

  const recommendedKm = item.interval.defaultKm === null ? '—' : formatKm(item.interval.defaultKm);
  const recommendedMonths = item.interval.defaultMonths === null ? '—' : describeInterval(null, item.interval.defaultMonths);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-text-muted">{s.recommended(recommendedKm, recommendedMonths)}</p>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label={s.km}
          inputMode="numeric"
          suffix="km"
          value={kmText}
          onChange={(e) => {
            setKmText(e.target.value);
          }}
          error={errors.km}
        />
        <TextField
          label={s.months}
          inputMode="numeric"
          value={monthsText}
          onChange={(e) => {
            setMonthsText(e.target.value);
          }}
          error={errors.months}
        />
      </div>
      {errors.form !== undefined && <p className="font-medium text-danger">{errors.form}</p>}
      <Button type="submit" size="lg" block loading={update.isPending}>
        {s.save}
      </Button>
      {item.interval.source === 'CUSTOM' && (
        <Button
          variant="secondary"
          block
          onClick={() => {
            send({ resetInterval: true });
          }}
        >
          {s.reset}
        </Button>
      )}
      <Button
        variant="danger"
        block
        onClick={() => {
          send({ enabled: false });
        }}
      >
        {s.disable}
      </Button>
    </form>
  );
}
