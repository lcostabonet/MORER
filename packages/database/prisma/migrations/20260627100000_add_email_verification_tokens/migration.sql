-- Phase 11B-beta: email verification tokens table + Customer.emailVerifiedAt
-- Purely additive: no DROP, no destructive ALTER, no backfill.
-- Existing accounts keep emailVerifiedAt = NULL (i.e. unverified).

-- New nullable column on customers — additive, defaults to NULL.
ALTER TABLE "customers" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

CREATE TABLE "email_verification_tokens" (
    "id"         TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tokenHash"  TEXT NOT NULL,
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "usedAt"     TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- Unique constraints (also create implicit unique indexes)
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_customerId_key" UNIQUE ("customerId");
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_tokenHash_key" UNIQUE ("tokenHash");

-- Regular index on expiresAt for token expiry queries
CREATE INDEX "email_verification_tokens_expiresAt_idx" ON "email_verification_tokens"("expiresAt");

-- Foreign key: customer must exist; cascade delete when customer is deleted
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
