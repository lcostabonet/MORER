-- Phase 11H (Order authorization): order access capability.
-- Additive and non-destructive: the column is nullable, so all existing orders
-- (registered and guest/legacy) remain valid with NULL. Stores ONLY the SHA-256
-- hash of a server-generated capability token; the plaintext is never persisted.
-- The unique index guarantees no two orders can share the same capability hash.
ALTER TABLE "orders" ADD COLUMN "accessTokenHash" TEXT;
CREATE UNIQUE INDEX "orders_accessTokenHash_key" ON "orders"("accessTokenHash");
