-- AlterTable
ALTER TABLE "customers" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "customers" ADD COLUMN "registeredAt" TIMESTAMP(3);
