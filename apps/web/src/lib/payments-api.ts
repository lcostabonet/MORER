// NEXT_PUBLIC_ variables are baked in at build time by Next.js.
// Follows the same pattern as cart-api.ts and checkout-api.ts.
function getPaymentsApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url && process.env.NODE_ENV === 'production') {
    throw new Error(
      '[apps/web] NEXT_PUBLIC_API_URL is required in production. ' +
        'Set it before running next build.',
    );
  }
  return url ?? 'http://localhost:4000';
}

const API_URL = getPaymentsApiUrl();

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
  const res = await fetch(`${API_URL}/payments/create-intent`, {
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
  const res = await fetch(`${API_URL}/payments/reconcile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, paymentIntentId }),
  });
  if (!res.ok) await parseError(res, 'Error al verificar el pago');
  return res.json() as Promise<ReconcileResult>;
}
