-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "OrderConfirmationStatus" AS ENUM ('PENDING_CALL', 'CONFIRMED', 'DECLINED', 'NO_ANSWER', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('CHATBOT_STORE', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('PENDING', 'COMPLETED', 'NO_ANSWER', 'FAILED');

-- CreateEnum
CREATE TYPE "TwilioNumberStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'SUSPENDED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Session" ALTER COLUMN "expires" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Shop" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_domain" TEXT NOT NULL,
    "access_token" TEXT,
    "subscription_plan" "SubscriptionPlan" DEFAULT 'BASIC',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatbotConfiguration" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "bot_name" TEXT NOT NULL DEFAULT 'Verify',
    "welcome_message" TEXT NOT NULL DEFAULT 'Hola! Estoy aquí para ayudarte.',
    "webhook_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatbotConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "session_id" TEXT,
    "customer_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'PENDING',
    "agent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "assigned_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelnyxConfiguration" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "api_key" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelnyxConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderConfirmation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "internal_order_number" TEXT NOT NULL,
    "shopify_order_id" TEXT,
    "customer_phone" TEXT NOT NULL,
    "customer_name" TEXT,
    "customer_email" TEXT,
    "order_items" JSONB NOT NULL,
    "order_total" DECIMAL(10,2) NOT NULL,
    "shipping_address" JSONB,
    "source" "OrderSource" NOT NULL,
    "status" "OrderConfirmationStatus" NOT NULL DEFAULT 'PENDING_CALL',
    "call_scheduled_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfirmationCall" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_confirmation_id" UUID NOT NULL,
    "telnyx_call_id" TEXT,
    "status" "CallStatus" NOT NULL DEFAULT 'PENDING',
    "customer_response" TEXT,
    "initiated_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfirmationCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppConfiguration" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "welcome_message" TEXT NOT NULL DEFAULT '¡Hola! ¿En qué puedo ayudarte?',
    "business_hours" JSONB,
    "auto_responses" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwilioNumber" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone_number" TEXT NOT NULL,
    "twilio_sid" TEXT NOT NULL,
    "friendly_name" TEXT,
    "webhook_url" TEXT,
    "status" "TwilioNumberStatus" NOT NULL DEFAULT 'AVAILABLE',
    "shop_id" UUID,
    "assigned_at" TIMESTAMP(3),
    "monthly_cost" DECIMAL(8,2) NOT NULL,
    "purchased_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "next_billing" TIMESTAMP(3),
    "country_code" TEXT NOT NULL DEFAULT 'US',
    "number_type" TEXT NOT NULL DEFAULT 'local',
    "capabilities" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TwilioNumber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shop_domain_key" ON "Shop"("shop_domain");

-- CreateIndex
CREATE UNIQUE INDEX "ChatbotConfiguration_shop_id_key" ON "ChatbotConfiguration"("shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "TelnyxConfiguration_shop_id_key" ON "TelnyxConfiguration"("shop_id");

-- CreateIndex
CREATE INDEX "OrderConfirmation_status_idx" ON "OrderConfirmation"("status");

-- CreateIndex
CREATE INDEX "OrderConfirmation_call_scheduled_at_idx" ON "OrderConfirmation"("call_scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "OrderConfirmation_internal_order_number_shop_id_key" ON "OrderConfirmation"("internal_order_number", "shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "ConfirmationCall_order_confirmation_id_key" ON "ConfirmationCall"("order_confirmation_id");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConfiguration_shop_id_key" ON "WhatsAppConfiguration"("shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "TwilioNumber_phone_number_key" ON "TwilioNumber"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "TwilioNumber_twilio_sid_key" ON "TwilioNumber"("twilio_sid");

-- CreateIndex
CREATE UNIQUE INDEX "TwilioNumber_shop_id_key" ON "TwilioNumber"("shop_id");

-- CreateIndex
CREATE INDEX "TwilioNumber_status_idx" ON "TwilioNumber"("status");

-- CreateIndex
CREATE INDEX "TwilioNumber_shop_id_idx" ON "TwilioNumber"("shop_id");

-- CreateIndex
CREATE INDEX "TwilioNumber_phone_number_idx" ON "TwilioNumber"("phone_number");

-- AddForeignKey
ALTER TABLE "ChatbotConfiguration" ADD CONSTRAINT "ChatbotConfiguration_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelnyxConfiguration" ADD CONSTRAINT "TelnyxConfiguration_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderConfirmation" ADD CONSTRAINT "OrderConfirmation_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfirmationCall" ADD CONSTRAINT "ConfirmationCall_order_confirmation_id_fkey" FOREIGN KEY ("order_confirmation_id") REFERENCES "OrderConfirmation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppConfiguration" ADD CONSTRAINT "WhatsAppConfiguration_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwilioNumber" ADD CONSTRAINT "TwilioNumber_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
