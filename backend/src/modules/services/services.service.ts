import { randomUUID } from 'node:crypto';
import type {
  MaintenanceTypeCode,
  ServicePageDto,
  ServiceRecordDto,
  ServiceResultDto,
  VehicleDto,
  VehicleMaintenanceDto,
} from '@car-checkup/shared/dto';
import { MAINTENANCE_DEFAULTS } from '@car-checkup/shared/maintenance';
import type {
  ServiceCreateInput,
  ServicesListQuery,
  ServiceUpdateInput,
} from '@car-checkup/shared/schemas';
import { checkOrder, isFutureDate, isUnusual } from '@car-checkup/shared/validation';
import { env } from '../../config/env';
import type { Clock } from '../../lib/clock';
import { conflict, notFound, outOfOrder, validationError } from '../../lib/http-error';
import { prisma, type Tx } from '../../lib/prisma';
import { loadVehicleMaintenance } from '../maintenance/maintenance.mapper';
import { recomputeVehicleMaintenance } from '../maintenance/recompute';
import { loadNeighbors, loadVehicleDto } from '../readings/readings.service';
import { lockVehicle, recalculateVehicleOdometer } from '../readings/recalculate';

const sortOrder = new Map(MAINTENANCE_DEFAULTS.map((d) => [d.code, d.sortOrder]));
const byCatalogOrder = (a: MaintenanceTypeCode, b: MaintenanceTypeCode) =>
  (sortOrder.get(a) ?? 0) - (sortOrder.get(b) ?? 0);

type ServiceWithItems = {
  id: string;
  vehicleId: string;
  performedAt: Date;
  odometerKm: number;
  notes: string | null;
  readingId: string | null;
  createdAt: Date;
  items: { typeCode: MaintenanceTypeCode }[];
};

const withItems = { items: { select: { typeCode: true } } } as const;

function toServiceDto(s: ServiceWithItems): ServiceRecordDto {
  return {
    id: s.id,
    vehicleId: s.vehicleId,
    performedAt: s.performedAt.toISOString(),
    odometerKm: s.odometerKm,
    notes: s.notes,
    createdAt: s.createdAt.toISOString(),
    typeCodes: s.items.map((i) => i.typeCode).sort(byCatalogOrder),
    createdReading: s.readingId !== null,
  };
}

async function assertVehicleOwned(userId: string, vehicleId: string): Promise<void> {
  const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, userId }, select: { id: true } });
  if (vehicle === null) throw notFound();
}

async function results(
  tx: Tx,
  vehicleId: string,
  clock: Clock,
): Promise<{ vehicle: VehicleDto; maintenance: VehicleMaintenanceDto }> {
  await recalculateVehicleOdometer(tx, vehicleId);
  await recomputeVehicleMaintenance(tx, vehicleId);
  return {
    vehicle: await loadVehicleDto(tx, vehicleId, clock),
    maintenance: await loadVehicleMaintenance(tx, vehicleId, clock),
  };
}

/** Latest OK reading, optionally ignoring the reading linked to the service being edited. */
async function latestReading(tx: Tx, vehicleId: string, excludeId: string | null) {
  return tx.mileageReading.findFirst({
    where: { vehicleId, reviewStatus: 'OK', ...(excludeId !== null && { id: { not: excludeId } }) },
    orderBy: [{ readAt: 'desc' }, { id: 'desc' }],
    select: { odometerKm: true, readAt: true },
  });
}

/**
 * Validates the service odometer against the readings (FR-012) and decides whether it must be
 * recorded as a new reading because it is higher than the last one (FR-012a).
 */
async function validateOdometer(
  tx: Tx,
  vehicleId: string,
  odometerKm: number,
  performedAt: Date,
  confirmedUnusual: boolean,
  linkedReadingId: string | null,
): Promise<{ needsReading: boolean }> {
  const { prev, next } = await loadNeighbors(tx, vehicleId, performedAt, linkedReadingId ?? undefined);
  const order = checkOrder(odometerKm, prev, next);
  if (!order.ok) throw outOfOrder(order.validRange);
  const latest = await latestReading(tx, vehicleId, linkedReadingId);
  const needsReading =
    latest === null || (odometerKm > latest.odometerKm && performedAt.getTime() >= latest.readAt.getTime());
  if (needsReading && !confirmedUnusual && isUnusual(odometerKm, prev, performedAt, env.UNUSUAL_KM_PER_DAY)) {
    throw conflict('UNUSUAL_DISTANCE');
  }
  return { needsReading };
}

const sameCodes = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

export interface CreateServiceResult {
  result: ServiceResultDto;
  replayed: boolean;
}

/** Records a service (FR-010..FR-012a); idempotent by the client-generated id. */
export async function createService(
  userId: string,
  vehicleId: string,
  input: ServiceCreateInput,
  clock: Clock,
): Promise<CreateServiceResult> {
  await assertVehicleOwned(userId, vehicleId);
  const performedAt = new Date(input.performedAt);

  const existing = await prisma.serviceRecord.findUnique({ where: { id: input.id }, include: withItems });
  if (existing !== null) {
    const same =
      existing.vehicleId === vehicleId &&
      existing.odometerKm === input.odometerKm &&
      existing.performedAt.getTime() === performedAt.getTime() &&
      sameCodes(existing.items.map((i) => i.typeCode), input.typeCodes);
    if (!same) throw conflict('ID_CONFLICT');
    const extra = await prisma.$transaction(async (tx) => ({
      vehicle: await loadVehicleDto(tx, vehicleId, clock),
      maintenance: await loadVehicleMaintenance(tx, vehicleId, clock),
    }));
    return { result: { service: toServiceDto(existing), ...extra }, replayed: true };
  }
  if (isFutureDate(performedAt)) throw validationError({ performedAt: 'future' });

  const result = await prisma.$transaction(async (tx) => {
    await lockVehicle(tx, vehicleId);
    const { needsReading } = await validateOdometer(tx, vehicleId, input.odometerKm, performedAt, input.confirmedUnusual, null);
    const readingId = needsReading ? randomUUID() : null;
    if (readingId !== null) {
      await tx.mileageReading.create({
        data: {
          id: readingId,
          vehicleId,
          odometerKm: input.odometerKm,
          readAt: performedAt,
          source: 'SERVICE',
          origin: 'ONLINE',
          confirmedUnusual: input.confirmedUnusual,
        },
      });
    }
    const service = await tx.serviceRecord.create({
      data: {
        id: input.id,
        vehicleId,
        performedAt,
        odometerKm: input.odometerKm,
        notes: input.notes ?? null,
        readingId,
        items: { createMany: { data: input.typeCodes.map((typeCode) => ({ typeCode })) } },
      },
      include: withItems,
    });
    // Doing the maintenance cancels its snooze (FR-007a).
    await tx.vehicleMaintenanceSetting.updateMany({
      where: { vehicleId, typeCode: { in: input.typeCodes } },
      data: { snoozedUntil: null },
    });
    return { service: toServiceDto(service), ...(await results(tx, vehicleId, clock)) };
  });
  return { result, replayed: false };
}

async function findOwnedService(userId: string, vehicleId: string, serviceId: string) {
  const service = await prisma.serviceRecord.findFirst({
    where: { id: serviceId, vehicleId, vehicle: { userId } },
    include: withItems,
  });
  if (service === null) throw notFound();
  return service;
}

/** Corrects a service and keeps its generated reading consistent (FR-014). */
export async function updateService(
  userId: string,
  vehicleId: string,
  serviceId: string,
  input: ServiceUpdateInput,
  clock: Clock,
): Promise<ServiceResultDto> {
  const current = await findOwnedService(userId, vehicleId, serviceId);
  const performedAt = input.performedAt !== undefined ? new Date(input.performedAt) : current.performedAt;
  const odometerKm = input.odometerKm ?? current.odometerKm;
  if (isFutureDate(performedAt)) throw validationError({ performedAt: 'future' });

  return prisma.$transaction(async (tx) => {
    await lockVehicle(tx, vehicleId);
    const { needsReading } = await validateOdometer(
      tx,
      vehicleId,
      odometerKm,
      performedAt,
      input.confirmedUnusual ?? false,
      current.readingId,
    );
    let readingId = current.readingId;
    if (needsReading && readingId !== null) {
      await tx.mileageReading.update({ where: { id: readingId }, data: { odometerKm, readAt: performedAt } });
    } else if (needsReading) {
      readingId = randomUUID();
      await tx.mileageReading.create({
        data: { id: readingId, vehicleId, odometerKm, readAt: performedAt, source: 'SERVICE', origin: 'ONLINE' },
      });
    } else if (readingId !== null) {
      await tx.serviceRecord.update({ where: { id: serviceId }, data: { readingId: null } });
      await tx.mileageReading.delete({ where: { id: readingId } });
      readingId = null;
    }
    if (input.typeCodes !== undefined) {
      await tx.serviceRecordItem.deleteMany({ where: { serviceRecordId: serviceId } });
      await tx.serviceRecordItem.createMany({
        data: input.typeCodes.map((typeCode) => ({ serviceRecordId: serviceId, typeCode })),
      });
    }
    const service = await tx.serviceRecord.update({
      where: { id: serviceId },
      data: {
        performedAt,
        odometerKm,
        readingId,
        ...(input.notes !== undefined && { notes: input.notes }),
      },
      include: withItems,
    });
    return { service: toServiceDto(service), ...(await results(tx, vehicleId, clock)) };
  });
}

/** Deletes a service and the reading it created, unless that is the last valid reading (FR-014). */
export async function deleteService(
  userId: string,
  vehicleId: string,
  serviceId: string,
  clock: Clock,
): Promise<{ vehicle: VehicleDto; maintenance: VehicleMaintenanceDto }> {
  const current = await findOwnedService(userId, vehicleId, serviceId);
  return prisma.$transaction(async (tx) => {
    await lockVehicle(tx, vehicleId);
    await tx.serviceRecord.delete({ where: { id: serviceId } });
    if (current.readingId !== null) {
      const others = await tx.mileageReading.count({
        where: { vehicleId, reviewStatus: 'OK', id: { not: current.readingId } },
      });
      if (others > 0) await tx.mileageReading.delete({ where: { id: current.readingId } });
    }
    return results(tx, vehicleId, clock);
  });
}

function encodeCursor(performedAt: Date, id: string): string {
  return Buffer.from(`${performedAt.toISOString()}|${id}`).toString('base64url');
}

function decodeCursor(cursor: string): { performedAt: Date; id: string } {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const performedAt = new Date(iso ?? '');
  if (id === undefined || Number.isNaN(performedAt.getTime())) throw validationError({ cursor: 'invalid' });
  return { performedAt, id };
}

/** Service history newest first, keyset pagination on (performedAt, id). */
export async function listServices(
  userId: string,
  vehicleId: string,
  { cursor, limit }: ServicesListQuery,
): Promise<ServicePageDto> {
  await assertVehicleOwned(userId, vehicleId);
  const after = cursor !== undefined ? decodeCursor(cursor) : null;
  const rows = await prisma.serviceRecord.findMany({
    where: {
      vehicleId,
      ...(after !== null && {
        OR: [
          { performedAt: { lt: after.performedAt } },
          { performedAt: after.performedAt, id: { lt: after.id } },
        ],
      }),
    },
    orderBy: [{ performedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: withItems,
  });
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map(toServiceDto),
    nextCursor: rows.length > limit && last !== undefined ? encodeCursor(last.performedAt, last.id) : null,
  };
}
