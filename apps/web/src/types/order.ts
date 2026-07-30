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

// Shipping method chosen for the order (Phase 11F). Null for legacy/guest orders.
export interface OrderShippingMethod {
  code: string;
  name: string;
  description: string;
}

export interface OrderResponse {
  id: string;
  orderNumber: string;
  status: string;
  subtotalInCents: number;
  shippingInCents: number;
  taxInCents: number;
  totalInCents: number;
  currency: string;
  items: OrderItemResponse[];
  // Null for legacy orders created before snapshots existed.
  shippingAddress: OrderAddressSnapshot | null;
  billingAddress: OrderAddressSnapshot | null;
  shippingMethod: OrderShippingMethod | null;
  createdAt: string;
}
