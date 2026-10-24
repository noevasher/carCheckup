import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Banner, Button, ConfirmDialog, Skeleton } from '../../design/components';
import { messageForError, t } from '../../i18n/es';
import { ApiRequestError } from '../../lib/api';
import { useUserId } from '../auth/AuthProvider';
import { useDeleteVehicle, useUpdateVehicle, useVehicle, useVehicles } from './api';
import { EnableNotificationsButton } from '../notifications/EnableNotificationsButton';
import { storeActiveVehicle } from './useActiveVehicle';
import { VehicleForm, type VehicleFormValues } from './VehicleForm';

export function EditVehiclePage() {
  const { id = '' } = useParams();
  const userId = useUserId();
  const navigate = useNavigate();
  const vehicle = useVehicle(id);
  const vehicles = useVehicles();
  const update = useUpdateVehicle(id);
  const remove = useDeleteVehicle();
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (vehicle.isPending) return <Skeleton className="h-96" />;
  if (vehicle.isError) {
    return <Banner tone="danger">{messageForError(vehicle.error instanceof ApiRequestError ? vehicle.error.body?.error.code : 'NETWORK')}</Banner>;
  }
  const v = vehicle.data;

  function submit(values: VehicleFormValues) {
    update.mutate(
      {
        catalogModelId: values.catalogModelId,
        make: values.make,
        model: values.model,
        year: values.year,
        nickname: values.nickname,
        licensePlate: values.licensePlate,
        fuelType: values.fuelType,
        usageType: values.usageType,
        emailReminders: values.emailReminders,
      },
      { onSuccess: () => void navigate('/') },
    );
  }

  function onDelete() {
    remove.mutate(id, {
      onSuccess: () => {
        const next = vehicles.data?.find((other) => other.id !== id);
        if (next !== undefined) storeActiveVehicle(userId, next.id);
        setConfirmDelete(false);
        void navigate(next === undefined ? '/vehicles/new' : '/', { replace: true });
      },
    });
  }

  return (
    <section>
      <Link to="/" className="inline-flex min-h-tap items-center text-primary">
        ← {t.common.back}
      </Link>
      <h1 className="mb-5 text-2xl font-bold">{t.vehicle.editTitle}</h1>
      <VehicleForm
        mode="edit"
        initial={{
          make: { id: null, name: v.make },
          model: { id: v.catalogModelId, name: v.model },
          year: String(v.year),
          nickname: v.nickname ?? '',
          licensePlate: v.licensePlate ?? '',
          fuelType: v.fuelType,
          usageType: v.usageType,
          emailReminders: v.emailReminders,
        }}
        submitting={update.isPending}
        submitError={update.error}
        onSubmit={submit}
        footer={
          <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6">
            <EnableNotificationsButton />
            <Button
              variant="danger"
              block
              onClick={() => {
                setConfirmDelete(true);
              }}
            >
              {t.vehicle.delete}
            </Button>
          </div>
        }
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t.vehicle.deleteTitle}
        description={
          <>
            <p>{t.vehicle.deleteBody}</p>
            {remove.isError && <p className="mt-2 font-medium text-danger">{messageForError(undefined)}</p>}
          </>
        }
        confirmLabel={t.vehicle.deleteConfirm}
        tone="danger"
        loading={remove.isPending}
        onConfirm={onDelete}
      />
    </section>
  );
}
