import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { t } from '../../i18n/es';
import { useUserId } from '../auth/AuthProvider';
import { useCreateVehicle, useVehicles } from './api';
import { storeActiveVehicle } from './useActiveVehicle';
import { VehicleForm, type VehicleFormValues } from './VehicleForm';

export function NewVehiclePage() {
  const userId = useUserId();
  const navigate = useNavigate();
  const vehicles = useVehicles();
  const create = useCreateVehicle();
  // Kept across retries so a resubmission after a network failure is idempotent.
  const [initialReadingId] = useState(() => crypto.randomUUID());
  const [lastValues, setLastValues] = useState<VehicleFormValues | null>(null);
  const isFirst = vehicles.data !== undefined && vehicles.data.length === 0;

  function submit(values: VehicleFormValues) {
    setLastValues(values);
    create.mutate(
      { ...values, initialReadingId },
      {
        onSuccess: (vehicle) => {
          storeActiveVehicle(userId, vehicle.id);
          // The home screen then asks for notifications / email (feature 003, FR-008).
          void navigate('/', { replace: true, state: { newVehicleId: vehicle.id } });
        },
      },
    );
  }

  return (
    <section>
      {!isFirst && (
        <Link to="/" className="inline-flex min-h-tap items-center text-primary">
          ← {t.common.back}
        </Link>
      )}
      <h1 className="text-2xl font-bold">{t.vehicle.newTitle}</h1>
      <p className="mt-1 mb-5 text-text-muted">{t.vehicle.newSubtitle}</p>
      <VehicleForm
        mode="create"
        submitting={create.isPending}
        submitError={create.error}
        onSubmit={submit}
        {...(lastValues !== null && {
          onRetry: () => {
            submit(lastValues);
          },
        })}
      />
    </section>
  );
}
