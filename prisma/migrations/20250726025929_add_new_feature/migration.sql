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
CREATE TYPE "WhatsAppNumberStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "WhatsAppNumberAssignmentStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'RESERVED', 'MAINTENANCE');

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
    "personality" TEXT DEFAULT 'Chatbot amigable y conciso',
    "required_fields" JSONB DEFAULT '{"nombre": false, "numero": true, "correo": true, "direccion": false, "ciudad": false, "provincia": false, "pais": false}',
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
    "customerName" TEXT,
    "customerPhone" TEXT,
    "shopDomain" TEXT,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderConfirmation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "internal_order_number" TEXT NOT NULL,
    "shopify_order_id" TEXT,
    "shopify_order_name" TEXT,
    "customer_phone" TEXT NOT NULL,
    "customer_name" TEXT,
    "customer_email" TEXT,
    "order_items" JSONB NOT NULL,
    "order_total" DECIMAL(10,2) NOT NULL,
    "shipping_address" JSONB,
    "source" "OrderSource" NOT NULL,
    "status" "OrderConfirmationStatus" NOT NULL DEFAULT 'PENDING_CALL',
    "vonage_call_uuid" TEXT,
    "dtmf_response" TEXT,
    "call_scheduled_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "shop_country_code" TEXT,
    "shop_currency" TEXT,
    "shop_timezone" TEXT,
    "call_status" "CallStatus" DEFAULT 'PENDING',
    "call_started_at" TIMESTAMP(3),
    "last_event_at" TIMESTAMP(3),

    CONSTRAINT "OrderConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppNumber" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone_number" TEXT NOT NULL,
    "display_name" TEXT,
    "business_account_id" TEXT,
    "webhook_url" TEXT,
    "webhook_token" TEXT,
    "status" "WhatsAppNumberStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignment_status" "WhatsAppNumberAssignmentStatus" NOT NULL DEFAULT 'AVAILABLE',
    "default_shop_id" UUID,
    "assigned_at" TIMESTAMP(3),
    "detection_rules" JSONB,
    "country_code" TEXT NOT NULL DEFAULT 'BR',
    "provider" TEXT NOT NULL DEFAULT 'whatsapp_business',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VonageConfiguration" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "application_id" TEXT NOT NULL,
    "private_key" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "webhook_base_url" TEXT NOT NULL,
    "voice_language" TEXT NOT NULL DEFAULT 'es-ES',
    "voice_style" INTEGER NOT NULL DEFAULT 0,
    "call_timeout" INTEGER NOT NULL DEFAULT 30,
    "dtmf_timeout" INTEGER NOT NULL DEFAULT 15,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VonageConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shop_domain_key" ON "Shop"("shop_domain");

-- CreateIndex
CREATE UNIQUE INDEX "ChatbotConfiguration_shop_id_key" ON "ChatbotConfiguration"("shop_id");

-- CreateIndex
CREATE INDEX "OrderConfirmation_status_idx" ON "OrderConfirmation"("status");

-- CreateIndex
CREATE INDEX "OrderConfirmation_call_scheduled_at_idx" ON "OrderConfirmation"("call_scheduled_at");

-- CreateIndex
CREATE INDEX "OrderConfirmation_shopify_order_name_idx" ON "OrderConfirmation"("shopify_order_name");

-- CreateIndex
CREATE INDEX "OrderConfirmation_call_status_idx" ON "OrderConfirmation"("call_status");

-- CreateIndex
CREATE INDEX "OrderConfirmation_vonage_call_uuid_idx" ON "OrderConfirmation"("vonage_call_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "OrderConfirmation_internal_order_number_shop_id_key" ON "OrderConfirmation"("internal_order_number", "shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppNumber_phone_number_key" ON "WhatsAppNumber"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppNumber_business_account_id_key" ON "WhatsAppNumber"("business_account_id");

-- CreateIndex
CREATE INDEX "WhatsAppNumber_status_idx" ON "WhatsAppNumber"("status");

-- CreateIndex
CREATE INDEX "WhatsAppNumber_phone_number_idx" ON "WhatsAppNumber"("phone_number");

-- CreateIndex
CREATE INDEX "WhatsAppNumber_business_account_id_idx" ON "WhatsAppNumber"("business_account_id");

-- CreateIndex
CREATE INDEX "WhatsAppNumber_assignment_status_idx" ON "WhatsAppNumber"("assignment_status");

-- CreateIndex
CREATE UNIQUE INDEX "VonageConfiguration_shop_id_key" ON "VonageConfiguration"("shop_id");

-- AddForeignKey
ALTER TABLE "ChatbotConfiguration" ADD CONSTRAINT "ChatbotConfiguration_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderConfirmation" ADD CONSTRAINT "OrderConfirmation_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppNumber" ADD CONSTRAINT "WhatsAppNumber_default_shop_id_fkey" FOREIGN KEY ("default_shop_id") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VonageConfiguration" ADD CONSTRAINT "VonageConfiguration_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
