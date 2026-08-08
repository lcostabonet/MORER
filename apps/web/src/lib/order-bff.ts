import { NextResponse } from 'next/server';

// Phase 11H — shared projections + error forwarding for the order/payment BFF
// routes (create-intent, reconcile, cancel, lookup). Upstream objects are never
// forwarded verbatim: explicit allowlists guarantee no server-only field leaks.

const GENERIC = 'No se ha podido procesar la solicitud. Inténtalo de nuevo.';

function asObject(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

// create-intent response. clientSecret IS returned (the one place Stripe.js needs
// it) — but nothing else the API might add.
export function toClientPaymentIntent(raw: unknown): {
  clientSecret: string;
  paymentIntentId: string;
  amountInCents: number;
  currency: string;
} {
  const r = asObject(raw);
  return {
    clientSecret: str(r.clientSecret),
    paymentIntentId: str(r.paymentIntentId),
    amountInCents: num(r.amountInCents),
    currency: str(r.currency) || 'eur',
  };
}

// reconcile response — status flags only, never a secret.
export function toClientReconcile(raw: unknown): Record<string, unknown> {
  const r = asObject(raw);
  const out: Record<string, unknown> = {
    reconciled: r.reconciled === true,
    alreadyPaid: r.alreadyPaid === true,
  };
  if (typeof r.piStatus === 'string') out.piStatus = r.piStatus;
  if (typeof r.status === 'string') out.status = r.status;
  return out;
}

// Forwards an API error as { message } with the same 4xx status (else 503). The
// order/payment clients read data.message. The API's user-facing message is
// preserved (e.g. ORDER_ALREADY_PAID) but capped; internals never leak.
export async function forwardOrderApiError(apiRes: Response): Promise<NextResponse> {
  let message = GENERIC;
  try {
    const data = (await apiRes.json()) as { message?: unknown };
    if (typeof data.message === 'string' && data.message.length > 0 && data.message.length <= 200) {
      message = data.message;
    }
  } catch {
    // keep generic
  }
  const status = apiRes.status >= 400 && apiRes.status < 500 ? apiRes.status : 503;
  return NextResponse.json({ message }, { status });
}
