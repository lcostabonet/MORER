-- Phase 11D: customer address book
-- Purely additive: no DROP, no destructive ALTER, no backfill.

CREATE TYPE "CustomerAddressType" AS ENUM ('SHIPPING', 'BILLING', 'BOTH');

CREATE TABLE "CustomerAddress" (
    "id"                TEXT NOT NULL,
    "customerId"        TEXT NOT NULL,
    "fullName"          TEXT NOT NULL,
    "phone"             TEXT,
    "line1"             TEXT NOT NULL,
    "line2"             TEXT,
    "postalCode"        TEXT NOT NULL,
    "city"              TEXT NOT NULL,
    "province"          TEXT NOT NULL,
    "countryCode"       TEXT NOT NULL DEFAULT 'ES',
    "type"              "CustomerAddressType" NOT NULL,
    "isDefaultShipping" BOOLEAN NOT NULL DEFAULT false,
    "isDefaultBilling"  BOOLEAN NOT NULL DEFAULT false,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerAddress_customerId_idx" ON "CustomerAddress"("customerId");
CREATE INDEX "CustomerAddress_customerId_type_idx" ON "CustomerAddress"("customerId", "type");

-- Enforce at most one default shipping and one default billing per customer.
-- These PARTIAL UNIQUE indexes are a DB-level backstop that Prisma 5.22 cannot
-- express declaratively; the service also serializes default changes in
-- transactions. A concurrent race that both try to set a default hits one of
-- these and surfaces as P2002, mapped to a safe error.
CREATE UNIQUE INDEX "customer_addresses_one_default_shipping"
ON "CustomerAddress"("customerId")
WHERE "isDefaultShipping" = true;

CREATE UNIQUE INDEX "customer_addresses_one_default_billing"
ON "CustomerAddress"("customerId")
WHERE "isDefaultBilling" = true;

ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
