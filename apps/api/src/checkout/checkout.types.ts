import type { OrderAddressSnapshot } from './order-address-snapshot';

export type { OrderAddressSnapshot } from './order-address-snapshot';

export interface OrderItemResponse {
  id: string;
  productName: string;
  variantSize: string;
  quantity: number;
  unitPriceInCents: number;
  lineTotalInCents: number;
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
  // Immutable address snapshots taken at order time (Phase 11E). Null for legacy
  // orders created before snapshots existed. Never sourced from the live
  // CustomerAddress nor from the legacy `shippingAddress` column.
  shippingAddress: OrderAddressSnapshot | null;
  billingAddress: OrderAddressSnapshot | null;
  createdAt: Date;
}

export interface OrderLookupResponse {
  orderId: string;
}

// Public address projection used by the checkout selection UI.
export interface CheckoutAddress {
  id: string;
  fullName: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  province: string;
  countryCode: string;
  type: 'SHIPPING' | 'BILLING' | 'BOTH';
  isDefaultShipping: boolean;
  isDefaultBilling: boolean;
}

export interface CustomerCheckoutState {
  shippingAddresses: CheckoutAddress[];
  billingAddresses: CheckoutAddress[];
  defaultShippingId: string | null;
  defaultBillingId: string | null;
}
