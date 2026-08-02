export interface CartItemResponse {
  id: string;
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  size: string;
  sku: string;
  quantity: number;
  unitPriceInCents: number;
  lineTotalInCents: number;
  availableStock: number;
  isAvailable: boolean;
}

// The client-facing cart shape returned by the BFF. sessionId is intentionally
// absent: it equals the httpOnly cart-session cookie and must never reach the
// client (the BFF strips it via toClientCart).
export interface CartResponse {
  id: string;
  status: string;
  items: CartItemResponse[];
  subtotalInCents: number;
  currency: string;
}
