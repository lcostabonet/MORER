-- Phase 11B-alpha: password reset tokens table
-- Purely additive: no DROP, no ALTER on existing tables.

CREATE TABLE "password_reset_tokens" (
    "id"         TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tokenHash"  TEXT NOT NULL,
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "usedAt"     TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- Unique constraints (also create implicit unique indexes)
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_customerId_key" UNIQUE ("customerId");
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_tokenHash_key" UNIQUE ("tokenHash");

-- Regular index on expiresAt for token expiry queries
CREATE INDEX "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");

-- Foreign key: customer must exist; cascade delete when customer is deleted
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
