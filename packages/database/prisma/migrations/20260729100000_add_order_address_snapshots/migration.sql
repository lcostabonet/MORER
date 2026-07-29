-- Phase 11E-alpha: fixed address snapshots on orders
-- Purely additive: two nullable JSON columns. No DROP, no backfill.
-- The legacy "shippingAddress" column is left intact and untouched.

ALTER TABLE "orders" ADD COLUMN "shippingAddressSnapshot" JSONB;
ALTER TABLE "orders" ADD COLUMN "billingAddressSnapshot" JSONB;
