import type { FuelType, UsageType } from '@car-checkup/shared/dto';
import { VehicleCreateSchema, VehicleUpdateSchema } from '@car-checkup/shared/schemas';
import { parseKmInput } from '@car-checkup/shared/validation';
import { type SyntheticEvent, type ReactNode, useState } from 'react';
import { Banner, Button, TextField } from '../../design/components';
import { cx } from '../../design/cx';
import { fieldMessage, messageForError, t } from '../../i18n/es';
import { ApiRequestError, NetworkError } from '../../lib/api';
import { Autocomplete, type CatalogValue } from '../catalog/Autocomplete';
import { useMakeSearch, useModelSearch } from '../catalog/useCatalogSearch';

export interface VehicleFormValues {
  catalogModelId: string | null;
  make: string;
  model: string;
  year: number;
  odometerKm: number;
  nickname: string | null;
  licensePlate: string | null;
  fuelType: FuelType | null;
  usageType: UsageType | null;
  emailReminders: boolean;
}

export interface VehicleFormInitial {
  make: CatalogValue;
  model: CatalogValue;
  year: string;
  nickname: string;
  licensePlate: string;
  fuelType: FuelType | null;
  usageType: UsageType | null;
  emailReminders: boolean;
}

const emptyInitial: VehicleFormInitial = {
  make: { id: null, name: '' },
  model: { id: null, name: '' },
  year: '',
  nickname: '',
  licensePlate: '',
  fuelType: null,
  usageType: null,
  emailReminders: false,
};

interface VehicleFormProps {
  mode: 'create' | 'edit';
  initial?: VehicleFormInitial;
  submitting: boolean;
  submitError: unknown;
  onSubmit: (values: VehicleFormValues) => void;
  onRetry?: () => void;
  footer?: ReactNode;
}

const fuelTypes: FuelType[] = ['GASOLINE', 'DIESEL', 'HYBRID', 'ELECTRIC'];
const usageTypes: UsageType[] = ['CITY', 'HIGHWAY', 'MIXED'];

/**
 * Vehicle registration/edit form (FR-001, FR-001a, FR-002). Only make, model, year and km are
 * required; the optional block can be skipped with no extra step.
 */
export function VehicleForm({
  mode,
  initial = emptyInitial,
  submitting,
  submitError,
  onSubmit,
  onRetry,
  footer,
}: VehicleFormProps) {
  const [make, setMake] = useState<CatalogValue>(initial.make);
  const [model, setModel] = useState<CatalogValue>(initial.model);
  const [year, setYear] = useState(initial.year);
  const [km, setKm] = useState('');
  const [nickname, setNickname] = useState(initial.nickname);
  const [licensePlate, setLicensePlate] = useState(initial.licensePlate);
  const [fuelType, setFuelType] = useState<FuelType | null>(initial.fuelType);
  const [usageType, setUsageType] = useState<UsageType | null>(initial.usageType);
  const [emailReminders, setEmailReminders] = useState(initial.emailReminders);
  const [showMore, setShowMore] = useState(
    mode === 'edit' && (initial.nickname !== '' || initial.licensePlate !== '' || initial.fuelType !== null),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const makes = useMakeSearch(make.id === null ? make.name : '');
  const models = useModelSearch(make.id, model.id === null ? model.name : '');

  function onMakeChange(value: CatalogValue) {
    setMake(value);
    // A different make invalidates a catalog model selection.
    if (value.id !== make.id) setModel((m) => ({ id: null, name: m.name }));
  }

  function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const yearNumber = /^\d{4}$/.test(year.trim()) ? Number(year.trim()) : Number.NaN;
    const odometerKm = parseKmInput(km);
    const candidate = {
      catalogModelId: model.id,
      make: make.name,
      model: model.name,
      year: Number.isNaN(yearNumber) ? undefined : yearNumber,
      nickname,
      licensePlate,
      fuelType,
      usageType,
    };
    const parsed =
      mode === 'create'
        ? VehicleCreateSchema.omit({ initialReadingId: true }).safeParse({
            ...candidate,
            odometerKm: odometerKm ?? undefined,
          })
        : VehicleUpdateSchema.safeParse(candidate);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? '_');
        next[field] ??= fieldMessage(field, issue.code === 'custom' ? issue.message : issue.code);
      }
      setErrors(next);
      return;
    }
    setErrors({});
    const data = parsed.data;
    onSubmit({
      catalogModelId: data.catalogModelId ?? null,
      make: data.make ?? make.name,
      model: data.model ?? model.name,
      year: data.year ?? yearNumber,
      odometerKm: odometerKm ?? 0,
      nickname: data.nickname ?? null,
      licensePlate: data.licensePlate ?? null,
      fuelType: data.fuelType ?? null,
      usageType: data.usageType ?? null,
      emailReminders,
    });
  }

  const serverFields =
    submitError instanceof ApiRequestError && submitError.body?.error.fields !== undefined
      ? Object.fromEntries(
          Object.entries(submitError.body.error.fields).map(([f, code]) => [f, fieldMessage(f, code)]),
        )
      : {};
  const fieldError = (f: string): string | undefined => errors[f] ?? serverFields[f];
  const offline = submitError instanceof NetworkError;

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
      <Autocomplete
        label={t.vehicle.make}
        placeholder={t.vehicle.makePlaceholder}
        value={make}
        onChange={onMakeChange}
        options={make.id === null ? (makes.data ?? []) : []}
        loading={makes.isFetching}
        error={fieldError('make')}
      />
      <Autocomplete
        label={t.vehicle.model}
        placeholder={t.vehicle.modelPlaceholder}
        value={model}
        onChange={setModel}
        options={make.id !== null && model.id === null ? (models.data ?? []) : []}
        loading={models.isFetching}
        error={fieldError('model')}
        hint={
          model.name.trim() !== '' && model.id === null && !models.isFetching && make.id !== null
            ? t.vehicle.uncatalogued
            : undefined
        }
      />
      <div className={cx('grid gap-4', mode === 'create' && 'grid-cols-[2fr_3fr]')}>
        <TextField
          label={t.vehicle.year}
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          placeholder="2019"
          value={year}
          onChange={(e) => {
            setYear(e.target.value.replace(/\D/g, ''));
          }}
          error={fieldError('year')}
        />
        {mode === 'create' && (
          <TextField
            label={t.vehicle.km}
            inputMode="numeric"
            autoComplete="off"
            placeholder="45.350"
            suffix="km"
            value={km}
            onChange={(e) => {
              setKm(e.target.value);
            }}
            hint={t.vehicle.kmHint}
            error={fieldError('odometerKm')}
          />
        )}
      </div>

      <EmailRemindersSwitch checked={emailReminders} onChange={setEmailReminders} />

      <div className="rounded-card border border-border">
        <button
          type="button"
          aria-expanded={showMore}
          onClick={() => {
            setShowMore((v) => !v);
          }}
          className="flex min-h-tap w-full items-center justify-between px-4 font-medium"
        >
          {t.vehicle.more}
          <span aria-hidden>{showMore ? '−' : '+'}</span>
        </button>
        {showMore && (
          <div className="flex flex-col gap-4 border-t border-border p-4">
            <TextField
              label={t.vehicle.nickname}
              hint={t.vehicle.nicknameHint}
              maxLength={40}
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value);
              }}
              error={fieldError('nickname')}
            />
            <TextField
              label={t.vehicle.plate}
              autoCapitalize="characters"
              maxLength={15}
              value={licensePlate}
              onChange={(e) => {
                setLicensePlate(e.target.value);
              }}
              error={fieldError('licensePlate')}
            />
            <ChoiceGroup
              label={t.vehicle.fuel}
              options={fuelTypes.map((f) => ({ value: f, label: t.fuelType[f] }))}
              value={fuelType}
              onChange={setFuelType}
            />
            <ChoiceGroup
              label={t.vehicle.usage}
              options={usageTypes.map((u) => ({ value: u, label: t.usageType[u] }))}
              value={usageType}
              onChange={setUsageType}
            />
          </div>
        )}
      </div>

      {offline ? (
        <Banner
          tone="warning"
          action={
            onRetry !== undefined && (
              <Button variant="secondary" onClick={onRetry} loading={submitting}>
                {t.vehicle.retry}
              </Button>
            )
          }
        >
          {t.vehicle.offline}
        </Banner>
      ) : submitError !== null && submitError !== undefined && Object.keys(serverFields).length === 0 ? (
        <Banner tone="danger">
          {messageForError(submitError instanceof ApiRequestError ? submitError.body?.error.code : undefined)}
        </Banner>
      ) : null}

      <Button type="submit" size="lg" block loading={submitting}>
        {mode === 'create' ? t.vehicle.save : t.vehicle.saveChanges}
      </Button>
      {footer}
    </form>
  );
}

function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T | null) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                onChange(selected ? null : o.value);
              }}
              className={cx(
                'min-h-tap rounded-full border px-4 font-medium',
                selected ? 'border-primary bg-primary text-on-primary' : 'border-border bg-surface',
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** "Recibir también los avisos por correo" (feature 003, FR-007): off by default; push is always on. */
function EmailRemindersSwitch({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-card border border-border px-4 py-3">
      <div>
        <p id="email-reminders-label" className="font-medium">
          {t.notifications.emailToggle}
        </p>
        <p className="text-sm text-text-muted">{t.notifications.emailToggleHint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby="email-reminders-label"
        onClick={() => {
          onChange(!checked);
        }}
        className={cx(
          'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-border',
        )}
      >
        <span
          aria-hidden
          className={cx(
            'inline-block size-6 rounded-full bg-surface shadow transition-transform',
            checked ? 'translate-x-7' : 'translate-x-1',
          )}
        />
      </button>
    </div>
  );
}
