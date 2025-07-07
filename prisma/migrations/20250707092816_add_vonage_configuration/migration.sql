-- AlterTable
ALTER TABLE "OrderConfirmation" ADD COLUMN     "dtmf_response" TEXT,
ADD COLUMN     "vonage_call_uuid" TEXT;

-- CreateTable
CREATE TABLE "VonageConfiguration" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "application_id" TEXT NOT NULL,
    "private_key" TEXT NOT NULL,
    "api_key" TEXT,
    "api_secret" TEXT,
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
CREATE UNIQUE INDEX "VonageConfiguration_shop_id_key" ON "VonageConfiguration"("shop_id");

-- AddForeignKey
ALTER TABLE "VonageConfiguration" ADD CONSTRAINT "VonageConfiguration_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
