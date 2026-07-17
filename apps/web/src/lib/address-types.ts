export type AddressType = 'SHIPPING' | 'BILLING' | 'BOTH';

export interface CustomerAddress {
  id: string;
  fullName: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  province: string;
  countryCode: string;
  type: AddressType;
  isDefaultShipping: boolean;
  isDefaultBilling: boolean;
  createdAt: string;
  updatedAt: string;
}
