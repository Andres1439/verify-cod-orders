-- CreateEnum
CREATE TYPE "WhatsAppSessionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CLOSED');

-- CreateTable
CREATE TABLE "WhatsAppSession" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "whatsapp_number_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "detection_method" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "conversation_context" JSONB,
    "customer_intent" TEXT,
    "status" "WhatsAppSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "message_count" INTEGER NOT NULL DEFAULT 1,
    "last_bot_response" TEXT,

    CONSTRAINT "WhatsAppSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppSession_session_id_key" ON "WhatsAppSession"("session_id");

-- CreateIndex
CREATE INDEX "WhatsAppSession_phone_number_idx" ON "WhatsAppSession"("phone_number");

-- CreateIndex
CREATE INDEX "WhatsAppSession_session_id_idx" ON "WhatsAppSession"("session_id");

-- CreateIndex
CREATE INDEX "WhatsAppSession_last_message_at_idx" ON "WhatsAppSession"("last_message_at");

-- CreateIndex
CREATE INDEX "WhatsAppSession_expires_at_idx" ON "WhatsAppSession"("expires_at");

-- CreateIndex
CREATE INDEX "WhatsAppSession_status_idx" ON "WhatsAppSession"("status");

-- AddForeignKey
ALTER TABLE "WhatsAppSession" ADD CONSTRAINT "WhatsAppSession_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppSession" ADD CONSTRAINT "WhatsAppSession_whatsapp_number_id_fkey" FOREIGN KEY ("whatsapp_number_id") REFERENCES "WhatsAppNumber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
