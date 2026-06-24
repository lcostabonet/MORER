-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "trackingNumber" TEXT;
ALTER TABLE "orders" ADD COLUMN     "trackingUrl" TEXT;
ALTER TABLE "orders" ADD COLUMN     "shippingEmailSentAt" TIMESTAMP(3);
