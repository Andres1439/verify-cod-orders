/*
  Warnings:

  - You are about to drop the column `api_key` on the `VonageConfiguration` table. All the data in the column will be lost.
  - You are about to drop the column `api_secret` on the `VonageConfiguration` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "VonageConfiguration" DROP COLUMN "api_key",
DROP COLUMN "api_secret";
