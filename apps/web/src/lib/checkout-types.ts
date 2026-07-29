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

export interface CustomerCheckoutState {
  shippingAddresses: CheckoutAddress[];
  billingAddresses: CheckoutAddress[];
  defaultShippingId: string | null;
  defaultBillingId: string | null;
}
