export interface CreatePaymentIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
  amountInCents: number;
  currency: string;
}

export interface PaymentResponse {
  id: string;
  orderId: string;
  status: string;
  amountInCents: number;
  currency: string;
  createdAt: Date;
}

export interface ReconcileResponse {
  reconciled: boolean;
  alreadyPaid: boolean;
  piStatus?: string;
  status?: string;
}
