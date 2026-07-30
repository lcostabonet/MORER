export type CheckoutAddressType = 'SHIPPING' | 'BILLING' | 'BOTH';

// The address shape returned by GET /api/checkout (no internal timestamps).
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
  type: CheckoutAddressType;
  isDefaultShipping: boolean;
  isDefaultBilling: boolean;
}

export type ShippingMethodCode = 'STANDARD' | 'EXPRESS';

// A priced shipping method as returned by GET /api/checkout. priceInCents is
// backend-computed (free-shipping rule already applied); the client never sends it.
export interface ShippingMethodOption {
  code: ShippingMethodCode;
  name: string;
  description: string;
  priceInCents: number;
}

export interface CustomerCheckoutState {
  shippingAddresses: CheckoutAddress[];
  billingAddresses: CheckoutAddress[];
  defaultShippingId: string | null;
  defaultBillingId: string | null;
  // Phase 11F-alpha: shipping methods priced against the current cart subtotal.
  shippingMethods: ShippingMethodOption[];
  defaultShippingMethodCode: ShippingMethodCode;
  subtotalInCents: number;
  taxInCents: number;
  totalInCents: number;
}
