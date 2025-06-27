/*
  Warnings:

  - Added the required column `customerName` to the `Ticket` table without a default value. This is not possible if the table is not empty.
  - Added the required column `customerPhone` to the `Ticket` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shopDomain` to the `Ticket` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "customerName" TEXT NOT NULL,
ADD COLUMN     "customerPhone" TEXT NOT NULL,
ADD COLUMN     "shopDomain" TEXT NOT NULL;
