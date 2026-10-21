import type { Tx } from '../../lib/prisma';

/**
 * Re-derives Vehicle.currentOdometerKm / lastReadingAt from the latest OK reading
 * (data-model rule 5). Must run in the same transaction that changed the readings.
 */
export async function recalculateVehicleOdometer(tx: Tx, vehicleId: string): Promise<void> {
  const latest = await tx.mileageReading.findFirst({
    where: { vehicleId, reviewStatus: 'OK' },
    orderBy: [{ readAt: 'desc' }, { id: 'desc' }],
    select: { odometerKm: true, readAt: true },
  });
  if (latest === null) return;
  await tx.vehicle.update({
    where: { id: vehicleId },
    data: { currentOdometerKm: latest.odometerKm, lastReadingAt: latest.readAt },
  });
}

/** Serializes concurrent reading writes for one vehicle (row lock on the vehicle). */
export async function lockVehicle(tx: Tx, vehicleId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM vehicles WHERE id = ${vehicleId}::uuid FOR UPDATE`;
}
