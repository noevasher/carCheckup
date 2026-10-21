/**
 * Compile-time guard: every key of the schema output must exist on the Prisma model input,
 * so request schemas cannot drift from the data model (research R1).
 */
export type AssertKeysIn<Schema, Model> = Exclude<keyof Schema, keyof Model> extends never
  ? true
  : { error: 'Schema has keys not present in the Prisma model'; keys: Exclude<keyof Schema, keyof Model> };

export const MAX_ODOMETER_KM = 2_000_000;
export const MIN_VEHICLE_YEAR = 1950;
