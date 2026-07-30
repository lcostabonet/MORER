import type { OrderAddressSnapshot } from './order-address-snapshot';
import type { ShippingMethodCode, ShippingMethodOption } from './shipping-methods';

export type { OrderAddressSnapshot } from './order-address-snapshot';
export type { ShippingMethodOption } from './shipping-methods';

export interface OrderItemResponse {
  id: string;
  productName: string;
  variantSize: string;
  quantity: number;
  unitPriceInCents: number;
  lineTotalInCents: number;
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
  // Money breakdown. subtotalInCents is derived (total - shipping - tax) so it is
  // exact for both new and legacy orders without a stored column.
  subtotalInCents: number;
  shippingInCents: number;
  taxInCents: number;
  totalInCents: number;
  currency: string;
  items: OrderItemResponse[];
  // Immutable address snapshots taken at order time (Phase 11E). Null for legacy
  // orders created before snapshots existed. Never sourced from the live
  // CustomerAddress nor from the legacy `shippingAddress` column.
  shippingAddress: OrderAddressSnapshot | null;
  billingAddress: OrderAddressSnapshot | null;
  shippingMethod: OrderShippingMethod | null;
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
  // Phase 11F-alpha: shipping methods priced against the current cart subtotal,
  // plus the money breakdown for the default method. Backend is the source of truth.
  shippingMethods: ShippingMethodOption[];
  defaultShippingMethodCode: ShippingMethodCode;
  subtotalInCents: number;
  taxInCents: number;
  totalInCents: number;
}
