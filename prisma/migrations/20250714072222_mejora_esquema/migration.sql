/*
  Warnings:

  - You are about to drop the `TwilioNumber` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WhatsAppConfiguration` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "WhatsAppNumberStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'MAINTENANCE');

-- DropForeignKey
ALTER TABLE "TwilioNumber" DROP CONSTRAINT "TwilioNumber_shop_id_fkey";

-- DropForeignKey
ALTER TABLE "WhatsAppConfiguration" DROP CONSTRAINT "WhatsAppConfiguration_shop_id_fkey";

-- DropTable
DROP TABLE "TwilioNumber";

-- DropTable
DROP TABLE "WhatsAppConfiguration";

-- DropEnum
DROP TYPE "TwilioNumberStatus";

-- CreateTable
CREATE TABLE "WhatsAppNumber" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone_number" TEXT NOT NULL,
    "display_name" TEXT,
    "business_account_id" TEXT,
    "webhook_url" TEXT,
    "webhook_token" TEXT,
    "status" "WhatsAppNumberStatus" NOT NULL DEFAULT 'ACTIVE',
    "default_shop_id" UUID,
    "detection_rules" JSONB,
    "country_code" TEXT NOT NULL DEFAULT 'BR',
    "provider" TEXT NOT NULL DEFAULT 'whatsapp_business',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppNumber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppNumber_phone_number_key" ON "WhatsAppNumber"("phone_number");

-- CreateIndex
CREATE INDEX "WhatsAppNumber_status_idx" ON "WhatsAppNumber"("status");

-- CreateIndex
CREATE INDEX "WhatsAppNumber_phone_number_idx" ON "WhatsAppNumber"("phone_number");
