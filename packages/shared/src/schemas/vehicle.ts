import { z } from 'zod';
import { FuelType, UsageType } from '../generated/prisma/enums';
import type { Vehicle } from '../generated/prisma/browser';
import { type AssertKeysIn, MAX_ODOMETER_KM, MIN_VEHICLE_YEAR } from './common';

const name = z.string().trim().min(1).max(60);

/** Optional free text; empty input is stored as null. */
const optionalText = (max: number, transform: (v: string) => string = (v) => v) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : transform(v)))
    .nullable()
    .optional();

const year = z
  .int()
  .min(MIN_VEHICLE_YEAR)
  .refine((y) => y <= new Date().getFullYear() + 1, { message: 'too_big' });

const vehicleFields = {
  catalogModelId: z.uuid().nullable().optional(),
  make: name,
  model: name,
  year,
  nickname: optionalText(40),
  licensePlate: optionalText(15, (v) => v.toUpperCase()),
  fuelType: z.enum(FuelType).nullable().optional(),
  usageType: z.enum(UsageType).nullable().optional(),
};

export const VehicleCreateSchema = z.object({
  ...vehicleFields,
  odometerKm: z.int().min(0).max(MAX_ODOMETER_KM),
  initialReadingId: z.uuid(),
});
export type VehicleCreateInput = z.infer<typeof VehicleCreateSchema>;

export const VehicleUpdateSchema = z
  .object({
    catalogModelId: vehicleFields.catalogModelId,
    make: name.optional(),
    model: name.optional(),
    year: year.optional(),
    nickname: vehicleFields.nickname,
    licensePlate: vehicleFields.licensePlate,
    fuelType: vehicleFields.fuelType,
    usageType: vehicleFields.usageType,
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'empty' });
export type VehicleUpdateInput = z.infer<typeof VehicleUpdateSchema>;

// Vehicle fields must exist on the Prisma model (odometerKm/initialReadingId feed the initial reading).
type VehicleCreateVehicleFields = Omit<VehicleCreateInput, 'odometerKm' | 'initialReadingId'>;
export const vehicleCreateMatchesModel: AssertKeysIn<VehicleCreateVehicleFields, Vehicle> = true;
export const vehicleUpdateMatchesModel: AssertKeysIn<VehicleUpdateInput, Vehicle> = true;
