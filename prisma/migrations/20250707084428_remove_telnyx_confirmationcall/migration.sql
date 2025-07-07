/*
  Warnings:

  - You are about to drop the `TelnyxConfiguration` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "TelnyxConfiguration" DROP CONSTRAINT "TelnyxConfiguration_shop_id_fkey";

-- DropTable
DROP TABLE "TelnyxConfiguration";
