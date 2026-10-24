-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'PAYPAL');

-- CreateEnum
CREATE TYPE "DonationKind" AS ENUM ('ONE_TIME', 'MONTHLY_CHARGE');

-- CreateEnum
CREATE TYPE "DonationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELED', 'FAILED', 'REFUNDED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- DropIndex
DROP INDEX "notices_vehicle_kind_type_cycle_key";

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "ad_free_until" TIMESTAMPTZ(3),
ADD COLUMN     "donation_card_dismissed_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "donations" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "kind" "DonationKind" NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'MXN',
    "status" "DonationStatus" NOT NULL DEFAULT 'PENDING',
    "checkout_key" UUID,
    "provider_checkout_id" VARCHAR(255),
    "provider_payment_id" VARCHAR(255),
    "subscription_id" UUID,
    "period_start" TIMESTAMPTZ(3),
    "period_end" TIMESTAMPTZ(3),
    "ad_free_days" INTEGER NOT NULL DEFAULT 0,
    "confirmed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "donations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donation_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "provider" "PaymentProvider" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "checkout_key" UUID NOT NULL,
    "provider_checkout_id" VARCHAR(255),
    "provider_subscription_id" VARCHAR(255),
    "paid_until" TIMESTAMPTZ(3),
    "next_charge_at" TIMESTAMPTZ(3),
    "canceled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "donation_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paypal_plans" (
    "amount_cents" INTEGER NOT NULL,
    "env" VARCHAR(16) NOT NULL,
    "plan_id" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paypal_plans_pkey" PRIMARY KEY ("amount_cents","env")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "provider" "PaymentProvider" NOT NULL,
    "event_id" VARCHAR(255) NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "donation_id" UUID,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("provider","event_id")
);

-- CreateIndex
CREATE INDEX "donations_provider_provider_checkout_id_idx" ON "donations"("provider", "provider_checkout_id");

-- CreateIndex
CREATE INDEX "donations_user_id_created_at_idx" ON "donations"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "donations_user_id_checkout_key_key" ON "donations"("user_id", "checkout_key");

-- CreateIndex
CREATE UNIQUE INDEX "donations_provider_provider_payment_id_key" ON "donations"("provider", "provider_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "donation_subscriptions_provider_subscription_id_key" ON "donation_subscriptions"("provider_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "donation_subscriptions_user_id_checkout_key_key" ON "donation_subscriptions"("user_id", "checkout_key");

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "donation_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_subscriptions" ADD CONSTRAINT "donation_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Feature 004: at most one ACTIVE/PAST_DUE monthly donation per user (data-model.md).
CREATE UNIQUE INDEX "donation_subscriptions_one_active_per_user"
  ON "donation_subscriptions" ("user_id") WHERE "status" IN ('ACTIVE', 'PAST_DUE');

ALTER TABLE "donations" ADD CONSTRAINT "donations_amount_cents_range"
  CHECK ("amount_cents" BETWEEN 2000 AND 1000000);
ALTER TABLE "donation_subscriptions" ADD CONSTRAINT "donation_subscriptions_amount_cents_range"
  CHECK ("amount_cents" BETWEEN 2000 AND 1000000);

-- Only the backend (table owner) accesses data.
ALTER TABLE "donations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "donation_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "paypal_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_events" ENABLE ROW LEVEL SECURITY;
