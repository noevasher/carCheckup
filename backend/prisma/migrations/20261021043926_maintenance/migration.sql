-- CreateEnum
CREATE TYPE "MaintenanceTypeCode" AS ENUM ('OIL_CHANGE', 'ENGINE_AIR_FILTER', 'CABIN_AIR_FILTER', 'TIRE_ROTATION', 'ALIGNMENT_BALANCING', 'TIRE_REPLACEMENT', 'BRAKE_INSPECTION', 'BRAKE_FLUID', 'COOLANT', 'SPARK_PLUGS', 'TIMING_BELT', 'TRANSMISSION_FLUID', 'BATTERY_CHECK');

-- CreateEnum
CREATE TYPE "BaselineSource" AS ENUM ('SERVICE', 'PRIOR', 'VEHICLE_REGISTRATION');

-- CreateEnum
CREATE TYPE "IntervalSource" AS ENUM ('DEFAULT', 'CITY_ADJUSTED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PaceSource" AS ENUM ('READINGS', 'USAGE_DEFAULT');

-- CreateEnum
CREATE TYPE "LimitingFactor" AS ENUM ('KM', 'TIME');

-- AlterEnum
ALTER TYPE "ReadingSource" ADD VALUE 'SERVICE';

-- CreateTable
CREATE TABLE "maintenance_types" (
    "code" "MaintenanceTypeCode" NOT NULL,
    "interval_km" INTEGER,
    "interval_months" INTEGER,
    "fuel_types" "FuelType"[],
    "applies_when_fuel_unknown" BOOLEAN NOT NULL,
    "severe_usage_sensitive" BOOLEAN NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "maintenance_types_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "vehicle_maintenance_settings" (
    "vehicle_id" UUID NOT NULL,
    "type_code" "MaintenanceTypeCode" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "custom_interval_km" INTEGER,
    "custom_interval_months" INTEGER,
    "prior_km" INTEGER,
    "prior_date" DATE,
    "prior_unknown" BOOLEAN NOT NULL DEFAULT false,
    "snoozed_until" DATE,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_maintenance_settings_pkey" PRIMARY KEY ("vehicle_id","type_code")
);

-- CreateTable
CREATE TABLE "service_records" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "performed_at" TIMESTAMPTZ(3) NOT NULL,
    "odometer_km" INTEGER NOT NULL,
    "notes" VARCHAR(500),
    "reading_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_record_items" (
    "service_record_id" UUID NOT NULL,
    "type_code" "MaintenanceTypeCode" NOT NULL,

    CONSTRAINT "service_record_items_pkey" PRIMARY KEY ("service_record_id","type_code")
);

-- CreateTable
CREATE TABLE "maintenance_estimates" (
    "vehicle_id" UUID NOT NULL,
    "type_code" "MaintenanceTypeCode" NOT NULL,
    "baseline_source" "BaselineSource" NOT NULL,
    "baseline_km" INTEGER NOT NULL,
    "baseline_at" TIMESTAMPTZ(3) NOT NULL,
    "interval_km" INTEGER,
    "interval_months" INTEGER,
    "interval_source" "IntervalSource" NOT NULL,
    "due_km" INTEGER,
    "due_by_time_at" TIMESTAMPTZ(3),
    "pace_km_per_day" DECIMAL(8,2) NOT NULL,
    "pace_source" "PaceSource" NOT NULL,
    "pace_usage_type" "UsageType",
    "pace_window_days" INTEGER,
    "estimated_by_km_at" TIMESTAMPTZ(3),
    "estimated_due_at" TIMESTAMPTZ(3),
    "limiting_factor" "LimitingFactor",
    "computed_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "maintenance_estimates_pkey" PRIMARY KEY ("vehicle_id","type_code")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_records_reading_id_key" ON "service_records"("reading_id");

-- CreateIndex
CREATE INDEX "service_records_vehicle_id_performed_at_idx" ON "service_records"("vehicle_id", "performed_at" DESC);

-- CreateIndex
CREATE INDEX "service_record_items_type_code_service_record_id_idx" ON "service_record_items"("type_code", "service_record_id");

-- CreateIndex
CREATE INDEX "maintenance_estimates_estimated_due_at_idx" ON "maintenance_estimates"("estimated_due_at");

-- AddForeignKey
ALTER TABLE "vehicle_maintenance_settings" ADD CONSTRAINT "vehicle_maintenance_settings_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_maintenance_settings" ADD CONSTRAINT "vehicle_maintenance_settings_type_code_fkey" FOREIGN KEY ("type_code") REFERENCES "maintenance_types"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_reading_id_fkey" FOREIGN KEY ("reading_id") REFERENCES "mileage_readings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_record_items" ADD CONSTRAINT "service_record_items_service_record_id_fkey" FOREIGN KEY ("service_record_id") REFERENCES "service_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_record_items" ADD CONSTRAINT "service_record_items_type_code_fkey" FOREIGN KEY ("type_code") REFERENCES "maintenance_types"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_estimates" ADD CONSTRAINT "maintenance_estimates_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_estimates" ADD CONSTRAINT "maintenance_estimates_type_code_fkey" FOREIGN KEY ("type_code") REFERENCES "maintenance_types"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written additions (data-model.md, research R3)
-- ---------------------------------------------------------------------------

-- Maintenance catalog: generic intervals, "whichever comes first" (spec Assumptions).
INSERT INTO "maintenance_types"
  ("code", "interval_km", "interval_months", "fuel_types", "applies_when_fuel_unknown", "severe_usage_sensitive", "sort_order")
VALUES
  ('OIL_CHANGE',          10000,  12, '{GASOLINE,DIESEL,HYBRID}',          true,  true,  10),
  ('ENGINE_AIR_FILTER',   20000,  24, '{GASOLINE,DIESEL,HYBRID}',          true,  true,  20),
  ('CABIN_AIR_FILTER',    15000,  12, '{GASOLINE,DIESEL,HYBRID,ELECTRIC}', true,  true,  30),
  ('TIRE_ROTATION',       10000,  12, '{GASOLINE,DIESEL,HYBRID,ELECTRIC}', true,  false, 40),
  ('ALIGNMENT_BALANCING', 10000,  12, '{GASOLINE,DIESEL,HYBRID,ELECTRIC}', true,  false, 50),
  ('TIRE_REPLACEMENT',    50000,  72, '{GASOLINE,DIESEL,HYBRID,ELECTRIC}', true,  false, 60),
  ('BRAKE_INSPECTION',    20000,  12, '{GASOLINE,DIESEL,HYBRID,ELECTRIC}', true,  true,  70),
  ('BRAKE_FLUID',         NULL,   24, '{GASOLINE,DIESEL,HYBRID,ELECTRIC}', true,  false, 80),
  ('COOLANT',             60000,  48, '{GASOLINE,DIESEL,HYBRID}',          true,  false, 90),
  ('SPARK_PLUGS',         40000,  48, '{GASOLINE,HYBRID}',                 false, false, 100),
  ('TIMING_BELT',         100000, 72, '{GASOLINE,DIESEL,HYBRID}',          true,  false, 110),
  ('TRANSMISSION_FLUID',  60000,  48, '{GASOLINE,DIESEL,HYBRID}',          true,  false, 120),
  ('BATTERY_CHECK',       NULL,   12, '{GASOLINE,DIESEL,HYBRID,ELECTRIC}', true,  false, 130);

ALTER TABLE "maintenance_types" ADD CONSTRAINT "maintenance_types_interval_check"
  CHECK (("interval_km" IS NULL OR "interval_km" > 0)
     AND ("interval_months" IS NULL OR "interval_months" > 0)
     AND ("interval_km" IS NOT NULL OR "interval_months" IS NOT NULL));

ALTER TABLE "vehicle_maintenance_settings" ADD CONSTRAINT "vms_custom_interval_km_check"
  CHECK ("custom_interval_km" IS NULL OR "custom_interval_km" BETWEEN 500 AND 300000);
ALTER TABLE "vehicle_maintenance_settings" ADD CONSTRAINT "vms_custom_interval_months_check"
  CHECK ("custom_interval_months" IS NULL OR "custom_interval_months" BETWEEN 1 AND 120);
ALTER TABLE "vehicle_maintenance_settings" ADD CONSTRAINT "vms_prior_km_check"
  CHECK ("prior_km" IS NULL OR "prior_km" >= 0);
ALTER TABLE "vehicle_maintenance_settings" ADD CONSTRAINT "vms_prior_unknown_check"
  CHECK (NOT ("prior_unknown" AND ("prior_km" IS NOT NULL OR "prior_date" IS NOT NULL)));

ALTER TABLE "service_records" ADD CONSTRAINT "service_records_odometer_km_check"
  CHECK ("odometer_km" BETWEEN 0 AND 2000000);

ALTER TABLE "maintenance_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vehicle_maintenance_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_record_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "maintenance_estimates" ENABLE ROW LEVEL SECURITY;
