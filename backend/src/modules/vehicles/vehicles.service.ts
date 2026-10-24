import type { VehicleDto } from '@car-checkup/shared/dto';
import type { VehicleCreateInput, VehicleUpdateInput } from '@car-checkup/shared/schemas';
import type { Clock } from '../../lib/clock';
import { conflict, notFound } from '../../lib/http-error';
import { prisma, type Tx } from '../../lib/prisma';
import { recomputeVehicleMaintenance } from '../maintenance/recompute';
import { pendingReviewCountInclude, toVehicleDtos, toVehicleDtoWithSummary } from './vehicle.mapper';

/** Returns catalog make/model names for a catalog model id, or throws 404. */
async function resolveCatalogNames(
  tx: Tx,
  catalogModelId: string,
): Promise<{ make: string; model: string }> {
  const entry = await tx.catalogModel.findUnique({
    where: { id: catalogModelId },
    select: { name: true, make: { select: { name: true } } },
  });
  if (entry === null) throw notFound();
  return { make: entry.make.name, model: entry.name };
}

export interface CreateVehicleResult {
  vehicle: VehicleDto;
  /** True when the request replayed an already-created vehicle (same initialReadingId). */
  replayed: boolean;
}

/**
 * Creates the vehicle and its INITIAL reading in one transaction and makes it the active vehicle
 * (FR-001, FR-003, US3-1). Retrying with the same `initialReadingId` returns the same vehicle.
 */
export async function createVehicle(
  userId: string,
  input: VehicleCreateInput,
  clock: Clock,
): Promise<CreateVehicleResult> {
  const existing = await prisma.mileageReading.findUnique({
    where: { id: input.initialReadingId },
    select: { source: true, vehicle: { include: pendingReviewCountInclude } },
  });
  if (existing !== null) {
    if (existing.vehicle.userId !== userId || existing.source !== 'INITIAL') {
      throw conflict('ID_CONFLICT');
    }
    return { vehicle: await toVehicleDtoWithSummary(prisma, existing.vehicle, clock), replayed: true };
  }

  const vehicle = await prisma.$transaction(async (tx) => {
    const names =
      input.catalogModelId != null
        ? await resolveCatalogNames(tx, input.catalogModelId)
        : { make: input.make, model: input.model };
    const now = new Date();
    const created = await tx.vehicle.create({
      data: {
        userId,
        make: names.make,
        model: names.model,
        catalogModelId: input.catalogModelId ?? null,
        year: input.year,
        nickname: input.nickname ?? null,
        licensePlate: input.licensePlate ?? null,
        fuelType: input.fuelType ?? null,
        usageType: input.usageType ?? null,
        emailReminders: input.emailReminders ?? false,
        currentOdometerKm: input.odometerKm,
        lastReadingAt: now,
        readings: {
          create: {
            id: input.initialReadingId,
            odometerKm: input.odometerKm,
            readAt: now,
            source: 'INITIAL',
            origin: 'ONLINE',
          },
        },
      },
      include: pendingReviewCountInclude,
    });
    await tx.profile.update({ where: { id: userId }, data: { activeVehicleId: created.id } });
    await recomputeVehicleMaintenance(tx, created.id);
    return toVehicleDtoWithSummary(tx, created, clock);
  });
  return { vehicle, replayed: false };
}

export async function listVehicles(userId: string, clock: Clock): Promise<VehicleDto[]> {
  const vehicles = await prisma.vehicle.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: pendingReviewCountInclude,
  });
  return toVehicleDtos(prisma, vehicles, clock);
}

export async function getVehicle(userId: string, vehicleId: string, clock: Clock): Promise<VehicleDto> {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, userId },
    include: pendingReviewCountInclude,
  });
  if (vehicle === null) throw notFound();
  return toVehicleDtoWithSummary(prisma, vehicle, clock);
}

export async function updateVehicle(
  userId: string,
  vehicleId: string,
  input: VehicleUpdateInput,
  clock: Clock,
): Promise<VehicleDto> {
  return prisma.$transaction(async (tx) => {
    const owned = await tx.vehicle.findFirst({ where: { id: vehicleId, userId }, select: { id: true } });
    if (owned === null) throw notFound();
    const names =
      input.catalogModelId != null ? await resolveCatalogNames(tx, input.catalogModelId) : null;
    const updated = await tx.vehicle.update({
      where: { id: vehicleId },
      data: {
        ...(input.catalogModelId !== undefined && { catalogModelId: input.catalogModelId }),
        ...(names !== null
          ? { make: names.make, model: names.model }
          : {
              ...(input.make !== undefined && { make: input.make }),
              ...(input.model !== undefined && { model: input.model }),
            }),
        ...(input.year !== undefined && { year: input.year }),
        ...(input.nickname !== undefined && { nickname: input.nickname }),
        ...(input.licensePlate !== undefined && { licensePlate: input.licensePlate }),
        ...(input.fuelType !== undefined && { fuelType: input.fuelType }),
        ...(input.usageType !== undefined && { usageType: input.usageType }),
        ...(input.emailReminders !== undefined && { emailReminders: input.emailReminders }),
      },
      include: pendingReviewCountInclude,
    });
    // Fuel type and usage change which maintenance applies and its intervals (FR-019).
    if (input.fuelType !== undefined || input.usageType !== undefined) {
      await recomputeVehicleMaintenance(tx, vehicleId);
    }
    return toVehicleDtoWithSummary(tx, updated, clock);
  });
}

/** Deletes the vehicle and, by cascade, its readings (FR-013). */
export async function deleteVehicle(userId: string, vehicleId: string): Promise<void> {
  const { count } = await prisma.vehicle.deleteMany({ where: { id: vehicleId, userId } });
  if (count === 0) throw notFound();
}
