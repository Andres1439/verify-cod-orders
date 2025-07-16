/*
  Warnings:

  - You are about to drop the `WhatsAppSession` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[phone_number]` on the table `WhatsAppNumber` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[business_account_id]` on the table `WhatsAppNumber` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "WhatsAppNumberAssignmentStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'RESERVED', 'MAINTENANCE');

-- DropForeignKey
ALTER TABLE "WhatsAppSession" DROP CONSTRAINT "WhatsAppSession_shop_id_fkey";

-- DropForeignKey
ALTER TABLE "WhatsAppSession" DROP CONSTRAINT "WhatsAppSession_whatsapp_number_id_fkey";

-- AlterTable
ALTER TABLE "WhatsAppNumber" ADD COLUMN     "assigned_at" TIMESTAMP(3),
ADD COLUMN     "assignment_status" "WhatsAppNumberAssignmentStatus" NOT NULL DEFAULT 'AVAILABLE';

-- DropTable
DROP TABLE "WhatsAppSession";

-- DropEnum
DROP TYPE "WhatsAppSessionStatus";

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppNumber_phone_number_key" ON "WhatsAppNumber"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppNumber_business_account_id_key" ON "WhatsAppNumber"("business_account_id");

-- CreateIndex
CREATE INDEX "WhatsAppNumber_business_account_id_idx" ON "WhatsAppNumber"("business_account_id");

-- CreateIndex
CREATE INDEX "WhatsAppNumber_assignment_status_idx" ON "WhatsAppNumber"("assignment_status");
