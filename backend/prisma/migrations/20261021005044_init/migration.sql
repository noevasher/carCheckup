-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('GASOLINE', 'DIESEL', 'HYBRID', 'ELECTRIC');

-- CreateEnum
CREATE TYPE "UsageType" AS ENUM ('CITY', 'HIGHWAY', 'MIXED');

-- CreateEnum
CREATE TYPE "ReadingSource" AS ENUM ('INITIAL', 'UPDATE');

-- CreateEnum
CREATE TYPE "ReadingOrigin" AS ENUM ('ONLINE', 'OFFLINE_SYNC');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('OK', 'NEEDS_REVIEW');

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "active_vehicle_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "make" VARCHAR(60) NOT NULL,
    "model" VARCHAR(60) NOT NULL,
    "catalog_model_id" UUID,
    "year" INTEGER NOT NULL,
    "nickname" VARCHAR(40),
    "license_plate" VARCHAR(15),
    "fuel_type" "FuelType",
    "usage_type" "UsageType",
    "current_odometer_km" INTEGER NOT NULL,
    "last_reading_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mileage_readings" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "odometer_km" INTEGER NOT NULL,
    "read_at" TIMESTAMPTZ(3) NOT NULL,
    "source" "ReadingSource" NOT NULL,
    "origin" "ReadingOrigin" NOT NULL,
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'OK',
    "confirmed_unusual" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "mileage_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_makes" (
    "id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,

    CONSTRAINT "catalog_makes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_models" (
    "id" UUID NOT NULL,
    "make_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,

    CONSTRAINT "catalog_models_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_active_vehicle_id_key" ON "profiles"("active_vehicle_id");

-- CreateIndex
CREATE INDEX "vehicles_user_id_created_at_idx" ON "vehicles"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "mileage_readings_vehicle_id_read_at_idx" ON "mileage_readings"("vehicle_id", "read_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "catalog_makes_name_key" ON "catalog_makes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_models_make_id_name_key" ON "catalog_models"("make_id", "name");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_active_vehicle_id_fkey" FOREIGN KEY ("active_vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_catalog_model_id_fkey" FOREIGN KEY ("catalog_model_id") REFERENCES "catalog_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mileage_readings" ADD CONSTRAINT "mileage_readings_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_models" ADD CONSTRAINT "catalog_models_make_id_fkey" FOREIGN KEY ("make_id") REFERENCES "catalog_makes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written additions (research R3, R6; data-model.md)
-- ---------------------------------------------------------------------------

-- Supabase installs extensions in the "extensions" schema; mirror that everywhere.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- unaccent() is STABLE; an IMMUTABLE wrapper with an explicit dictionary allows index use.
CREATE OR REPLACE FUNCTION public.f_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE PARALLEL SAFE STRICT
  SET search_path = ''
AS $$ SELECT extensions.unaccent('extensions.unaccent'::regdictionary, $1) $$;

CREATE INDEX "catalog_makes_name_trgm_idx"
  ON "catalog_makes" USING gin (public.f_unaccent(lower("name")) extensions.gin_trgm_ops);
CREATE INDEX "catalog_models_name_trgm_idx"
  ON "catalog_models" USING gin (public.f_unaccent(lower("name")) extensions.gin_trgm_ops);

CREATE INDEX "mileage_readings_needs_review_idx"
  ON "mileage_readings" ("vehicle_id") WHERE "review_status" = 'NEEDS_REVIEW';

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_year_check" CHECK ("year" >= 1950);
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_current_odometer_km_check"
  CHECK ("current_odometer_km" BETWEEN 0 AND 2000000);
ALTER TABLE "mileage_readings" ADD CONSTRAINT "mileage_readings_odometer_km_check"
  CHECK ("odometer_km" BETWEEN 0 AND 2000000);

-- RLS without policies: Supabase's public Data API (anon/authenticated roles) cannot read these
-- tables. The backend connects as the table owner, which bypasses RLS (research R3).
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mileage_readings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "catalog_makes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "catalog_models" ENABLE ROW LEVEL SECURITY;
