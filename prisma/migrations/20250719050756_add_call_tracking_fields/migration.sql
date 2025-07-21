-- AlterTable
ALTER TABLE "OrderConfirmation" ADD COLUMN     "call_started_at" TIMESTAMP(3),
ADD COLUMN     "call_status" "CallStatus" DEFAULT 'PENDING',
ADD COLUMN     "last_event_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "OrderConfirmation_call_status_idx" ON "OrderConfirmation"("call_status");

-- CreateIndex
CREATE INDEX "OrderConfirmation_vonage_call_uuid_idx" ON "OrderConfirmation"("vonage_call_uuid");
