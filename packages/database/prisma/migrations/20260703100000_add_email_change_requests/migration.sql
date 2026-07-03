-- Phase 11C-beta: email change requests table
-- Purely additive: no DROP, no destructive ALTER, no backfill.
-- Existing customers are unaffected (no pending change until they create one).

CREATE TABLE "email_change_requests" (
    "id"                     TEXT NOT NULL,
    "customerId"             TEXT NOT NULL,
    "currentEmailNormalized" TEXT NOT NULL,
    "newEmail"               TEXT NOT NULL,
    "newEmailNormalized"     TEXT NOT NULL,
    "tokenHash"              TEXT NOT NULL,
    "expiresAt"              TIMESTAMP(3) NOT NULL,
    "usedAt"                 TIMESTAMP(3),
    "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"              TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_change_requests_pkey" PRIMARY KEY ("id")
);

-- Unique constraints (also create implicit unique indexes)
ALTER TABLE "email_change_requests" ADD CONSTRAINT "email_change_requests_customerId_key" UNIQUE ("customerId");
ALTER TABLE "email_change_requests" ADD CONSTRAINT "email_change_requests_tokenHash_key" UNIQUE ("tokenHash");

-- Non-unique indexes: availability lookups by target email, and expiry sweeps.
-- newEmailNormalized is intentionally NOT unique here — final availability is
-- re-checked against Customer.emailNormalized at confirmation time.
CREATE INDEX "email_change_requests_newEmailNormalized_idx" ON "email_change_requests"("newEmailNormalized");
CREATE INDEX "email_change_requests_expiresAt_idx" ON "email_change_requests"("expiresAt");

-- Foreign key: customer must exist; cascade delete when customer is deleted
ALTER TABLE "email_change_requests" ADD CONSTRAINT "email_change_requests_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
