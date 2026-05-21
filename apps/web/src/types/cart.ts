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

export interface CartResponse {
  id: string;
  sessionId: string | null;
  status: string;
  items: CartItemResponse[];
  subtotalInCents: number;
  currency: string;
}
