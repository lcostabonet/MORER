-- Phase 11J — real admin authentication (separate from Customer auth).
-- Additive and non-destructive: both columns are nullable, so existing admin_users
-- rows remain valid. An admin with NULL passwordHash cannot log in; disabledAt
-- deactivates an admin without deleting the row.
ALTER TABLE "admin_users" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "admin_users" ADD COLUMN "disabledAt" TIMESTAMP(3);
