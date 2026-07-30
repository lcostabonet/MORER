-- Phase 11F-alpha: shipping method snapshot on the order.
-- Additive and non-destructive: all columns are nullable, so existing orders
-- (guest/legacy) remain valid with NULL method fields.
ALTER TABLE "orders" ADD COLUMN "shippingMethodCode" TEXT;
ALTER TABLE "orders" ADD COLUMN "shippingMethodName" TEXT;
ALTER TABLE "orders" ADD COLUMN "shippingMethodDescription" TEXT;
