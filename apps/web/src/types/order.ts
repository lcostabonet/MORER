export interface OrderItemResponse {
  id: string;
  productName: string;
  variantSize: string;
  quantity: number;
  unitPriceInCents: number;
  lineTotalInCents: number;
}

// Immutable address snapshot taken at order time (Phase 11E). Mirrors the API's
// OrderAddressSnapshot. Decoupled from the live saved address in /account.
export interface OrderAddressSnapshot {
  fullName: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  province: string;
  countryCode: string;
}

export interface OrderResponse {
  id: string;
  orderNumber: string;
  status: string;
  totalInCents: number;
  shippingInCents: number;
  taxInCents: number;
  currency: string;
  items: OrderItemResponse[];
  // Null for legacy orders created before snapshots existed.
  shippingAddress: OrderAddressSnapshot | null;
  billingAddress: OrderAddressSnapshot | null;
  createdAt: string;
}
