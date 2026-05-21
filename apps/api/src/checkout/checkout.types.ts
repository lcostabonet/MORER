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
