import type { MaintenanceTypeCode, VehicleMaintenanceDto } from '@car-checkup/shared/dto';
import { daysBetweenCalendarDates, SNOOZE_DAYS } from '@car-checkup/shared/maintenance';
import type { MaintenanceSettingUpdateInput } from '@car-checkup/shared/schemas';
import type { VehicleMaintenanceSetting } from '@car-checkup/shared/prisma';
import type { Clock } from '../../lib/clock';
import { notFound, validationError } from '../../lib/http-error';
import { prisma } from '../../lib/prisma';
import { lockVehicle } from '../readings/recalculate';
import { loadVehicleMaintenance } from './maintenance.mapper';
import { recomputeVehicleMaintenance } from './recompute';

async function findOwnedVehicle(userId: string, vehicleId: string) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, userId },
    select: { id: true, currentOdometerKm: true },
  });
  if (vehicle === null) throw notFound();
  return vehicle;
}

export async function getVehicleMaintenance(
  userId: string,
  vehicleId: string,
  clock: Clock,
): Promise<VehicleMaintenanceDto> {
  await findOwnedVehicle(userId, vehicleId);
  return loadVehicleMaintenance(prisma, vehicleId, clock);
}

const calendarDate = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

function addCalendarDays(today: string, days: number): Date {
  const d = calendarDate(today);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * Per-vehicle maintenance settings: snooze (FR-007a), prior history (FR-016), custom interval,
 * reset and enable/disable (FR-018). Changing interval or enabled clears the snooze.
 */
export async function updateMaintenanceSetting(
  userId: string,
  vehicleId: string,
  typeCode: MaintenanceTypeCode,
  input: MaintenanceSettingUpdateInput,
  clock: Clock,
): Promise<VehicleMaintenanceDto> {
  const vehicle = await findOwnedVehicle(userId, vehicleId);
  // Plain values only, so the same object is valid for both create and update.
  const data: Partial<
    Pick<
      VehicleMaintenanceSetting,
      'enabled' | 'customIntervalKm' | 'customIntervalMonths' | 'priorKm' | 'priorDate' | 'priorUnknown' | 'snoozedUntil'
    >
  > = {};
  const fieldErrors: Record<string, string> = {};

  if (input.snooze !== undefined) {
    data.snoozedUntil = input.snooze ? addCalendarDays(clock.today, SNOOZE_DAYS) : null;
  }
  if (input.resetInterval === true) {
    data.customIntervalKm = null;
    data.customIntervalMonths = null;
  } else {
    if (input.customIntervalKm !== undefined) data.customIntervalKm = input.customIntervalKm;
    if (input.customIntervalMonths !== undefined) data.customIntervalMonths = input.customIntervalMonths;
  }
  if (input.enabled !== undefined) data.enabled = input.enabled;
  const changesInterval =
    input.resetInterval === true || input.customIntervalKm !== undefined || input.customIntervalMonths !== undefined;
  if (changesInterval || input.enabled !== undefined) data.snoozedUntil = null;

  const prior = input.priorHistory;
  if (prior === 'UNKNOWN') {
    Object.assign(data, { priorKm: null, priorDate: null, priorUnknown: true });
  } else if (prior === null) {
    Object.assign(data, { priorKm: null, priorDate: null, priorUnknown: false });
  } else if (prior !== undefined) {
    if (prior.km !== undefined && prior.km > vehicle.currentOdometerKm) fieldErrors['priorHistory.km'] = 'too_big';
    if (prior.date !== undefined && daysBetweenCalendarDates(clock.today, prior.date) > 0) {
      fieldErrors['priorHistory.date'] = 'future';
    }
    Object.assign(data, {
      priorKm: prior.km ?? null,
      priorDate: prior.date !== undefined ? calendarDate(prior.date) : null,
      priorUnknown: false,
    });
  }
  if (Object.keys(fieldErrors).length > 0) throw validationError(fieldErrors);

  const onlySnooze = Object.keys(input).every((k) => k === 'snooze');
  return prisma.$transaction(async (tx) => {
    await lockVehicle(tx, vehicleId);
    await tx.vehicleMaintenanceSetting.upsert({
      where: { vehicleId_typeCode: { vehicleId, typeCode } },
      create: { ...data, vehicleId, typeCode },
      update: data,
    });
    // A snooze does not change the estimates themselves, only how they are shown.
    if (!onlySnooze) await recomputeVehicleMaintenance(tx, vehicleId);
    return loadVehicleMaintenance(tx, vehicleId, clock);
  });
}
