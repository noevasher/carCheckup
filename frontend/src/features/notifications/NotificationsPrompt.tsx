import type { VehicleDto } from '@car-checkup/shared/dto';
import { useEffect, useState } from 'react';
import { Button, ConfirmDialog, Sheet } from '../../design/components';
import { t } from '../../i18n/es';
import { useUpdateVehicle } from '../vehicles/api';
import { notificationPermission, pushSupport, subscribeToPush } from './push';

const flagKey = (userId: string) => `car-checkup:notifications-prompted:${userId}`;

export function wasPrompted(userId: string): boolean {
  try {
    return localStorage.getItem(flagKey(userId)) !== null;
  } catch {
    return false;
  }
}

function markPrompted(userId: string): void {
  try {
    localStorage.setItem(flagKey(userId), new Date().toISOString());
  } catch {
    // Storage unavailable: the explanation may be shown again on this device.
  }
}

type Step = 'explain' | 'install' | 'email' | 'done';

function initialStep(userId: string, vehicle: VehicleDto | null): Step {
  const support = pushSupport();
  const permission = notificationPermission();
  const emailStep: Step = vehicle !== null && !vehicle.emailReminders ? 'email' : 'done';
  if (permission === 'granted' && support === 'supported') return 'done';
  if (wasPrompted(userId)) return emailStep;
  if (support === 'needs-install') return 'install';
  if (support === 'unsupported' || permission === 'denied') return emailStep;
  return 'explain';
}

/**
 * Notification flow after registering a vehicle (FR-008, FR-008a, research R11):
 * explanation + permission once per device; if push is not possible and the vehicle has no
 * email, ask "¿Quieres recibir los avisos por correo?". `vehicle = null` (existing users on app
 * open) only offers the permission, never the email question.
 */
export function NotificationsPrompt({
  userId,
  vehicle,
  onDone,
}: {
  userId: string;
  vehicle: VehicleDto | null;
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>(() => initialStep(userId, vehicle));
  const [busy, setBusy] = useState(false);
  const update = useUpdateVehicle(vehicle?.id ?? '');

  // Side effects of the initial state: keep an allowed device subscribed, remember the prompt.
  useEffect(() => {
    if (notificationPermission() === 'granted' && pushSupport() === 'supported') {
      void subscribeToPush().catch(() => undefined);
    } else if (pushSupport() === 'unsupported' || notificationPermission() === 'denied') {
      markPrompted(userId);
    }
  }, [userId]);

  useEffect(() => {
    if (step === 'done') onDone();
  }, [step, onDone]);

  const afterPushFailed = () => {
    markPrompted(userId);
    setStep(vehicle !== null && !vehicle.emailReminders ? 'email' : 'done');
  };

  async function allow() {
    setBusy(true);
    const result = await subscribeToPush().catch(() => 'unsupported' as const);
    setBusy(false);
    if (result === 'subscribed') {
      markPrompted(userId);
      setStep('done');
    } else {
      afterPushFailed();
    }
  }

  const n = t.notifications;
  return (
    <>
      <Sheet
        open={step === 'explain'}
        onOpenChange={(open) => {
          if (!open) afterPushFailed();
        }}
        title={n.promptTitle}
      >
        <div className="flex flex-col gap-3">
          <p>{n.promptBody}</p>
          <Button size="lg" block loading={busy} onClick={() => void allow()}>
            {n.promptAllow}
          </Button>
          <Button variant="ghost" block onClick={afterPushFailed}>
            {n.promptLater}
          </Button>
        </div>
      </Sheet>
      <Sheet
        open={step === 'install'}
        onOpenChange={(open) => {
          if (!open) afterPushFailed();
        }}
        title={n.installTitle}
      >
        <div className="flex flex-col gap-3">
          <p>{n.installBody}</p>
          <Button size="lg" block onClick={afterPushFailed}>
            {n.installOk}
          </Button>
        </div>
      </Sheet>
      <ConfirmDialog
        open={step === 'email'}
        onOpenChange={(open) => {
          if (!open) setStep('done');
        }}
        title={n.emailQuestionTitle}
        description={n.emailQuestionBody}
        confirmLabel={n.emailYes}
        cancelLabel={n.emailNo}
        loading={update.isPending}
        onConfirm={() => {
          update.mutate(
            { emailReminders: true },
            {
              onSettled: () => {
                setStep('done');
              },
            },
          );
        }}
      />
    </>
  );
}
