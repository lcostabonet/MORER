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
