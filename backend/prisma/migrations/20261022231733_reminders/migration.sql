-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('OK', 'BOUNCED', 'COMPLAINED');

-- CreateEnum
CREATE TYPE "NoticeKind" AS ENUM ('MAINTENANCE_UPCOMING', 'MAINTENANCE_OVERDUE', 'MILEAGE_UPDATE');

-- CreateEnum
CREATE TYPE "NotifiedStatus" AS ENUM ('UPCOMING', 'OVERDUE');

-- CreateEnum
CREATE TYPE "DeliveryChannel" AS ENUM ('PUSH', 'EMAIL');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('SENT', 'FAILED', 'EXPIRED', 'BOUNCED', 'COMPLAINED');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "email" VARCHAR(320),
ADD COLUMN     "email_status" "EmailStatus" NOT NULL DEFAULT 'OK',
ADD COLUMN     "email_unsubscribed_at" TIMESTAMPTZ(3),
ADD COLUMN     "next_digest_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "time_zone" VARCHAR(64) NOT NULL DEFAULT 'America/Mexico_City';

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "email_reminders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_km_reminder_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" VARCHAR(2048) NOT NULL,
    "p256dh" VARCHAR(200) NOT NULL,
    "auth" VARCHAR(100) NOT NULL,
    "user_agent" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_success_at" TIMESTAMPTZ(3),
    "last_failure_at" TIMESTAMPTZ(3),

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_notice_states" (
    "vehicle_id" UUID NOT NULL,
    "type_code" "MaintenanceTypeCode" NOT NULL,
    "cycle_signature" VARCHAR(200) NOT NULL,
    "last_notified_status" "NotifiedStatus",
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "maintenance_notice_states_pkey" PRIMARY KEY ("vehicle_id","type_code")
);

-- CreateTable
CREATE TABLE "notices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "kind" "NoticeKind" NOT NULL,
    "type_code" "MaintenanceTypeCode",
    "cycle_key" VARCHAR(200) NOT NULL,
    "remaining_km" INTEGER,
    "overdue_days" INTEGER,
    "estimated_due_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMPTZ(3),

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channel" "DeliveryChannel" NOT NULL,
    "digest_date" DATE NOT NULL,
    "target" VARCHAR(64) NOT NULL,
    "status" "DeliveryStatus" NOT NULL,
    "provider_message_id" VARCHAR(200),
    "error" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_notices" (
    "delivery_id" UUID NOT NULL,
    "notice_id" UUID NOT NULL,

    CONSTRAINT "delivery_notices_pkey" PRIMARY KEY ("delivery_id","notice_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "notices_user_id_delivered_at_idx" ON "notices"("user_id", "delivered_at");

-- CreateIndex
CREATE INDEX "notices_created_at_idx" ON "notices"("created_at");

-- CreateIndex
CREATE INDEX "deliveries_provider_message_id_idx" ON "deliveries"("provider_message_id");

-- CreateIndex
CREATE INDEX "deliveries_created_at_idx" ON "deliveries"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_user_id_channel_digest_date_target_key" ON "deliveries"("user_id", "channel", "digest_date", "target");

-- CreateIndex
CREATE INDEX "profiles_next_digest_at_idx" ON "profiles"("next_digest_at");

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_notice_states" ADD CONSTRAINT "maintenance_notice_states_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_notice_states" ADD CONSTRAINT "maintenance_notice_states_type_code_fkey" FOREIGN KEY ("type_code") REFERENCES "maintenance_types"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_type_code_fkey" FOREIGN KEY ("type_code") REFERENCES "maintenance_types"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_notices" ADD CONSTRAINT "delivery_notices_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_notices" ADD CONSTRAINT "delivery_notices_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written additions (data-model.md, research R6, R7)
-- ---------------------------------------------------------------------------

-- Idempotency of notices (FR-013): one notice per vehicle, kind, maintenance and cycle.
-- NULLS NOT DISTINCT so mileage notices (type_code NULL) are unique too.
CREATE UNIQUE INDEX "notices_vehicle_kind_type_cycle_key"
  ON "notices" ("vehicle_id", "kind", "type_code", "cycle_key") NULLS NOT DISTINCT;

-- Existing profiles: next digest at the next 09:00 in the default time zone (UTC−6).
UPDATE "profiles"
SET "next_digest_at" = (
  date_trunc('day', now() AT TIME ZONE 'America/Mexico_City') + interval '9 hours'
  + CASE WHEN (now() AT TIME ZONE 'America/Mexico_City')::time >= time '09:00'
         THEN interval '1 day' ELSE interval '0 day' END
) AT TIME ZONE 'America/Mexico_City';

ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "maintenance_notice_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "delivery_notices" ENABLE ROW LEVEL SECURITY;
