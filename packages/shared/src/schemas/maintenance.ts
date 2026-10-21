import { z } from 'zod';
import { MaintenanceTypeCode } from '../generated/prisma/enums';
import type { ServiceRecord, VehicleMaintenanceSetting } from '../generated/prisma/browser';
import { type AssertKeysIn, MAX_ODOMETER_KM } from './common';

const typeCodes = z
  .array(z.enum(MaintenanceTypeCode))
  .min(1)
  .refine((codes) => new Set(codes).size === codes.length, { message: 'duplicate' });

const notes = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

const odometerKm = z.int().min(0).max(MAX_ODOMETER_KM);

export const ServiceCreateSchema = z.object({
  /** Generated on the client; idempotency key. */
  id: z.uuid(),
  performedAt: z.iso.datetime({ offset: true }),
  odometerKm,
  typeCodes,
  notes,
  confirmedUnusual: z.boolean().default(false),
});
export type ServiceCreateInput = z.infer<typeof ServiceCreateSchema>;

export const ServiceUpdateSchema = z
  .object({
    performedAt: z.iso.datetime({ offset: true }).optional(),
    odometerKm: odometerKm.optional(),
    typeCodes: typeCodes.optional(),
    notes,
    confirmedUnusual: z.boolean().optional(),
  })
  .refine(
    (v) => v.performedAt !== undefined || v.odometerKm !== undefined || v.typeCodes !== undefined || v.notes !== undefined,
    { message: 'empty' },
  );
export type ServiceUpdateInput = z.infer<typeof ServiceUpdateSchema>;

export const ServicesListQuery = z.object({
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ServicesListQuery = z.infer<typeof ServicesListQuery>;

export const PriorHistorySchema = z.union([
  z
    .object({ km: z.int().min(0).max(MAX_ODOMETER_KM).optional(), date: z.iso.date().optional() })
    .refine((v) => v.km !== undefined || v.date !== undefined, { message: 'empty' }),
  z.literal('UNKNOWN'),
  z.null(),
]);

export const MaintenanceSettingUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    customIntervalKm: z.int().min(500).max(300_000).nullable().optional(),
    customIntervalMonths: z.int().min(1).max(120).nullable().optional(),
    resetInterval: z.boolean().optional(),
    priorHistory: PriorHistorySchema.optional(),
    snooze: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'empty' });
export type MaintenanceSettingUpdateInput = z.infer<typeof MaintenanceSettingUpdateSchema>;

type ServiceCreateRecordFields = Omit<ServiceCreateInput, 'typeCodes' | 'confirmedUnusual'>;
export const serviceCreateMatchesModel: AssertKeysIn<ServiceCreateRecordFields, ServiceRecord> = true;
type SettingFields = Pick<MaintenanceSettingUpdateInput, 'enabled' | 'customIntervalKm' | 'customIntervalMonths'>;
export const settingUpdateMatchesModel: AssertKeysIn<SettingFields, VehicleMaintenanceSetting> = true;
