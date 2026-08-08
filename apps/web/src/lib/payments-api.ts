// Phase 11H: payments go through the same-origin BFF (never the API directly) so the
// server can attach the order credential (session JWT / guest capability) from
// httpOnly cookies the browser cannot read. Same-origin fetch sends those cookies
// automatically; the client only ever sends { orderId } / { orderId, paymentIntentId }.

async function parseError(res: Response, fallback: string): Promise<never> {
  const data = await res.json().catch(() => ({}));
  const msg = data.message as string | string[] | undefined;
  throw new Error(Array.isArray(msg) ? msg[0] : (msg ?? fallback));
}

export interface PaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
  amountInCents: number;
  currency: string;
}

export async function createPaymentIntent(orderId: string): Promise<PaymentIntentResult> {
  const res = await fetch('/api/payments/create-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }),
  });
  if (!res.ok) await parseError(res, 'Error al preparar el pago');
  return res.json() as Promise<PaymentIntentResult>;
}

export interface ReconcileResult {
  reconciled: boolean;
  alreadyPaid: boolean;
  piStatus?: string;
  status?: string;
}

export async function reconcilePayment(
  orderId: string,
  paymentIntentId: string,
): Promise<ReconcileResult> {
  const res = await fetch('/api/payments/reconcile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, paymentIntentId }),
  });
  if (!res.ok) await parseError(res, 'Error al verificar el pago');
  return res.json() as Promise<ReconcileResult>;
}
