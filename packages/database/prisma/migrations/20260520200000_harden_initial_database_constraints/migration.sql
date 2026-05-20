-- ─── Soft delete: ProductVariant ─────────────────────────────────────────────
-- Permite marcar variantes como eliminadas sin borrar el histórico de pedidos.
ALTER TABLE "product_variants" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- ─── Índices de rendimiento ───────────────────────────────────────────────────
-- Cart.sessionId: queries de carrito anónimo sin full scan.
CREATE INDEX "carts_sessionId_idx" ON "carts"("sessionId");

-- Event.type + createdAt: queries analíticas por tipo de evento en rango de fechas.
CREATE INDEX "events_type_createdAt_idx" ON "events"("type", "createdAt");

-- ─── CHECK constraints (no soportados por Prisma schema) ─────────────────────

-- Inventory: cantidades no pueden ser negativas.
-- Nota: reservedQuantity <= stockQuantity NO se añade a nivel DB porque las
-- operaciones de ajuste de stock en transacción requieren orden específico.
-- Este invariante se valida en el backend (Fase 3).
ALTER TABLE "inventory"
  ADD CONSTRAINT "inventory_stock_non_negative"    CHECK ("stockQuantity" >= 0),
  ADD CONSTRAINT "inventory_reserved_non_negative" CHECK ("reservedQuantity" >= 0);

-- ProductVariant: precio no puede ser negativo; compareAt debe ser >= price si existe.
ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_price_non_negative" CHECK ("priceInCents" >= 0),
  ADD CONSTRAINT "product_variants_compare_at_price"
    CHECK ("compareAtPriceInCents" IS NULL OR "compareAtPriceInCents" >= "priceInCents");

-- Orders: todos los importes deben ser >= 0.
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_amounts_non_negative"
    CHECK ("totalInCents" >= 0 AND "shippingInCents" >= 0 AND "taxInCents" >= 0);

-- Payments: importe no puede ser negativo.
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_non_negative" CHECK ("amountInCents" >= 0);
