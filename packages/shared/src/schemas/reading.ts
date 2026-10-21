import { z } from 'zod';
import { ReadingOrigin, ReviewStatus } from '../generated/prisma/enums';
import type { MileageReading } from '../generated/prisma/browser';
import { type AssertKeysIn, MAX_ODOMETER_KM } from './common';

const odometerKm = z.int().min(0).max(MAX_ODOMETER_KM);
const readAt = z.iso.datetime({ offset: true });

export const ReadingCreateSchema = z.object({
  /** Generated on the client; idempotency key. */
  id: z.uuid(),
  odometerKm,
  /** Fixed on the device at capture time (part of the idempotency check). */
  readAt,
  origin: z.enum(ReadingOrigin),
  confirmedUnusual: z.boolean().default(false),
});
export type ReadingCreateInput = z.infer<typeof ReadingCreateSchema>;

export const ReadingUpdateSchema = z
  .object({
    odometerKm: odometerKm.optional(),
    readAt: readAt.optional(),
    confirmedUnusual: z.boolean().optional(),
  })
  .refine((v) => v.odometerKm !== undefined || v.readAt !== undefined, { message: 'empty' });
export type ReadingUpdateInput = z.infer<typeof ReadingUpdateSchema>;

export const ReadingsListQuery = z.object({
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  reviewStatus: z.enum(ReviewStatus).optional(),
});
export type ReadingsListQuery = z.infer<typeof ReadingsListQuery>;

export const readingCreateMatchesModel: AssertKeysIn<ReadingCreateInput, MileageReading> = true;
export const readingUpdateMatchesModel: AssertKeysIn<ReadingUpdateInput, MileageReading> = true;
