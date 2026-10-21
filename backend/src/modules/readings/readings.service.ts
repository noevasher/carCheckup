import type { ReadingPageDto, ReadingResultDto, VehicleDto } from '@car-checkup/shared/dto';
import type {
  ReadingCreateInput,
  ReadingsListQuery,
  ReadingUpdateInput,
} from '@car-checkup/shared/schemas';
import { checkOrder, isFutureDate, isUnusual } from '@car-checkup/shared/validation';
import { env } from '../../config/env';
import { conflict, notFound, outOfOrder, validationError } from '../../lib/http-error';
import { prisma, type Tx } from '../../lib/prisma';
import { pendingReviewCountInclude, toVehicleDto } from '../vehicles/vehicle.mapper';
import { toReadingDto } from './reading.mapper';
import { lockVehicle, recalculateVehicleOdometer } from './recalculate';

async function assertVehicleOwned(userId: string, vehicleId: string): Promise<void> {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, userId },
    select: { id: true },
  });
  if (vehicle === null) throw notFound();
}

/** Immediate OK neighbors by readAt, using the (vehicle_id, read_at) index. */
async function loadNeighbors(tx: Tx, vehicleId: string, readAt: Date, excludeId?: string) {
  const base = {
    vehicleId,
    reviewStatus: 'OK' as const,
    ...(excludeId !== undefined && { id: { not: excludeId } }),
  };
  const select = { odometerKm: true, readAt: true };
  const [prev, next] = await Promise.all([
    tx.mileageReading.findFirst({
      where: { ...base, readAt: { lte: readAt } },
      orderBy: [{ readAt: 'desc' }, { id: 'desc' }],
      select,
    }),
    tx.mileageReading.findFirst({
      where: { ...base, readAt: { gt: readAt } },
      orderBy: [{ readAt: 'asc' }, { id: 'asc' }],
      select,
    }),
  ]);
  return { prev, next };
}

async function loadVehicleDto(tx: Tx, vehicleId: string): Promise<VehicleDto> {
  const vehicle = await tx.vehicle.findUniqueOrThrow({
    where: { id: vehicleId },
    include: pendingReviewCountInclude,
  });
  return toVehicleDto(vehicle);
}

const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';

export interface CreateReadingResult {
  result: ReadingResultDto;
  /** True when the reading already existed with the same content (idempotent replay). */
  replayed: boolean;
}

/** Idempotent by client-generated id (research R5); validates order/plausibility (R8). */
export async function createReading(
  userId: string,
  vehicleId: string,
  input: ReadingCreateInput,
): Promise<CreateReadingResult> {
  await assertVehicleOwned(userId, vehicleId);
  const readAt = new Date(input.readAt);

  const replay = await findReplay(vehicleId, input, readAt);
  if (replay !== null) return replay;

  if (isFutureDate(readAt)) throw validationError({ readAt: 'future' });

  try {
    const result = await prisma.$transaction(async (tx) => {
      await lockVehicle(tx, vehicleId);
      const { prev, next } = await loadNeighbors(tx, vehicleId, readAt);
      const offline = input.origin === 'OFFLINE_SYNC';
      const order = checkOrder(input.odometerKm, prev, next);
      if (!order.ok && !offline) throw outOfOrder(order.validRange);
      if (
        !offline &&
        !input.confirmedUnusual &&
        isUnusual(input.odometerKm, prev, readAt, env.UNUSUAL_KM_PER_DAY)
      ) {
        throw conflict('UNUSUAL_DISTANCE');
      }

      const reading = await tx.mileageReading.create({
        data: {
          id: input.id,
          vehicleId,
          odometerKm: input.odometerKm,
          readAt,
          source: 'UPDATE',
          origin: input.origin,
          // Offline readings that break the order are kept for the user to review.
          reviewStatus: order.ok ? 'OK' : 'NEEDS_REVIEW',
          confirmedUnusual: input.confirmedUnusual,
        },
      });
      await recalculateVehicleOdometer(tx, vehicleId);
      return { reading: toReadingDto(reading), vehicle: await loadVehicleDto(tx, vehicleId) };
    });
    return { result, replayed: false };
  } catch (err) {
    // Two concurrent requests with the same id: the loser becomes a replay.
    if (isUniqueViolation(err)) {
      const raced = await findReplay(vehicleId, input, readAt);
      if (raced !== null) return raced;
    }
    throw err;
  }
}

async function findReplay(
  vehicleId: string,
  input: ReadingCreateInput,
  readAt: Date,
): Promise<CreateReadingResult | null> {
  const existing = await prisma.mileageReading.findUnique({ where: { id: input.id } });
  if (existing === null) return null;
  const same =
    existing.vehicleId === vehicleId &&
    existing.odometerKm === input.odometerKm &&
    existing.readAt.getTime() === readAt.getTime();
  if (!same) throw conflict('ID_CONFLICT');
  const vehicle = await loadVehicleDto(prisma, vehicleId);
  return { result: { reading: toReadingDto(existing), vehicle }, replayed: true };
}

async function findOwnedReading(userId: string, vehicleId: string, readingId: string) {
  const reading = await prisma.mileageReading.findFirst({
    where: { id: readingId, vehicleId, vehicle: { userId } },
  });
  if (reading === null) throw notFound();
  return reading;
}

/** Corrects value and/or date; a valid correction moves NEEDS_REVIEW → OK (FR-012). */
export async function updateReading(
  userId: string,
  vehicleId: string,
  readingId: string,
  input: ReadingUpdateInput,
): Promise<ReadingResultDto> {
  const current = await findOwnedReading(userId, vehicleId, readingId);
  const odometerKm = input.odometerKm ?? current.odometerKm;
  const readAt = input.readAt !== undefined ? new Date(input.readAt) : current.readAt;
  if (isFutureDate(readAt)) throw validationError({ readAt: 'future' });

  return prisma.$transaction(async (tx) => {
    await lockVehicle(tx, vehicleId);
    const { prev, next } = await loadNeighbors(tx, vehicleId, readAt, readingId);
    const order = checkOrder(odometerKm, prev, next);
    if (!order.ok) throw outOfOrder(order.validRange);
    const confirmedUnusual = input.confirmedUnusual ?? false;
    if (!confirmedUnusual && isUnusual(odometerKm, prev, readAt, env.UNUSUAL_KM_PER_DAY)) {
      throw conflict('UNUSUAL_DISTANCE');
    }
    const reading = await tx.mileageReading.update({
      where: { id: readingId },
      data: { odometerKm, readAt, reviewStatus: 'OK', confirmedUnusual },
    });
    await recalculateVehicleOdometer(tx, vehicleId);
    return { reading: toReadingDto(reading), vehicle: await loadVehicleDto(tx, vehicleId) };
  });
}

/** The last remaining OK reading of a vehicle cannot be deleted (FR-012). */
export async function deleteReading(
  userId: string,
  vehicleId: string,
  readingId: string,
): Promise<VehicleDto> {
  await findOwnedReading(userId, vehicleId, readingId);
  return prisma.$transaction(async (tx) => {
    await lockVehicle(tx, vehicleId);
    const reading = await tx.mileageReading.findUnique({
      where: { id: readingId },
      select: { reviewStatus: true },
    });
    if (reading === null) throw notFound();
    if (reading.reviewStatus === 'OK') {
      const otherOk = await tx.mileageReading.count({
        where: { vehicleId, reviewStatus: 'OK', id: { not: readingId } },
      });
      if (otherOk === 0) throw conflict('LAST_READING_UNDELETABLE');
    }
    await tx.mileageReading.delete({ where: { id: readingId } });
    await recalculateVehicleOdometer(tx, vehicleId);
    return loadVehicleDto(tx, vehicleId);
  });
}

function encodeCursor(readAt: Date, id: string): string {
  return Buffer.from(`${readAt.toISOString()}|${id}`).toString('base64url');
}

function decodeCursor(cursor: string): { readAt: Date; id: string } {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const readAt = new Date(iso ?? '');
  if (id === undefined || Number.isNaN(readAt.getTime())) {
    throw validationError({ cursor: 'invalid' });
  }
  return { readAt, id };
}

/** Newest first, keyset pagination on (readAt, id). */
export async function listReadings(
  userId: string,
  vehicleId: string,
  { cursor, limit, reviewStatus }: ReadingsListQuery,
): Promise<ReadingPageDto> {
  await assertVehicleOwned(userId, vehicleId);
  const after = cursor !== undefined ? decodeCursor(cursor) : null;
  const rows = await prisma.mileageReading.findMany({
    where: {
      vehicleId,
      ...(reviewStatus !== undefined && { reviewStatus }),
      ...(after !== null && {
        OR: [
          { readAt: { lt: after.readAt } },
          { readAt: after.readAt, id: { lt: after.id } },
        ],
      }),
    },
    orderBy: [{ readAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map(toReadingDto),
    nextCursor: rows.length > limit && last !== undefined ? encodeCursor(last.readAt, last.id) : null,
  };
}
