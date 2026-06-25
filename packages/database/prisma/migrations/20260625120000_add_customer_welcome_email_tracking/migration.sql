-- Phase 10B-beta: welcome email tracking fields on customers
-- Purely additive: no DROP, no ALTER on existing columns.

ALTER TABLE "customers" ADD COLUMN "welcomeEmailSentAt" TIMESTAMP(3);
ALTER TABLE "customers" ADD COLUMN "welcomeEmailSendingAt" TIMESTAMP(3);
