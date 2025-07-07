/*
  Warnings:

  - You are about to drop the `ConfirmationCall` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ConfirmationCall" DROP CONSTRAINT "ConfirmationCall_order_confirmation_id_fkey";

-- DropTable
DROP TABLE "ConfirmationCall";
