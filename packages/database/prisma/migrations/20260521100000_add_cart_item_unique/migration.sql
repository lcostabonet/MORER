-- Prevents duplicate (cartId, variantId) pairs in cart_items.
-- Enables atomic upsert in CartService and catches DB-level race conditions.
CREATE UNIQUE INDEX "cart_items_cartId_variantId_key" ON "cart_items"("cartId", "variantId");
