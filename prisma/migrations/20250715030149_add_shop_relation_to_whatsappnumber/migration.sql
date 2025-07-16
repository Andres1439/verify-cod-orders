-- AddForeignKey
ALTER TABLE "WhatsAppNumber" ADD CONSTRAINT "WhatsAppNumber_default_shop_id_fkey" FOREIGN KEY ("default_shop_id") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
