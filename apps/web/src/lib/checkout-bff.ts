import { NextResponse } from 'next/server';
import type {
  CheckoutAddress,
  CustomerCheckoutState,
  ShippingMethodOption,
} from './checkout-types';

export const SESSION_EXPIRED = 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
export const GENERIC_ERROR =
  'No se ha podido procesar la solicitud. Inténtalo de nuevo.';

// The only fields the client may set. customerId, prices, and — since Phase
// 11G-alpha — cartId are all dropped: the cart is derived server-side from the
// httpOnly session cookie, never from the client. Address selection is by id only.
const CHECKOUT_FIELDS = [
  'shippingAddressId',
  'billingAddressId',
  'useShippingAsBilling',
  // Only the method CODE — never a price. Backend re-prices authoritatively.
  'shippingMethodCode',
] as const;

export function pickCheckoutPayload(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null) return {};
  const src = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of CHECKOUT_FIELDS) {
    if (field in src) out[field] = src[field];
  }
  return out;
}

// ─── Response projections (Phase 11G-alpha hardening) ─────────────────────────
//
// The checkout BFF must NOT forward upstream objects verbatim. These explicit
// allowlist projections guarantee that no server-only field (sessionId,
// customerId, internal cartId, address timestamps, tokens, future technical
// fields) can ever reach client JS, even if the API serializer changes. This
// mirrors toClientCart() for the cart routes.

function asObject(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function nullableStr(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

// The address id IS needed by the UI to select a shipping/billing address; no
// other identifier (customerId, addressId aliases, timestamps) is exposed.
function projectAddress(raw: unknown): CheckoutAddress {
  const a = asObject(raw);
  const type =
    a.type === 'BOTH' ? 'BOTH' : a.type === 'BILLING' ? 'BILLING' : 'SHIPPING';
  return {
    id: str(a.id),
    fullName: str(a.fullName),
    phone: nullableStr(a.phone),
    line1: str(a.line1),
    line2: nullableStr(a.line2),
    postalCode: str(a.postalCode),
    city: str(a.city),
    province: str(a.province),
    countryCode: str(a.countryCode),
    type,
    isDefaultShipping: a.isDefaultShipping === true,
    isDefaultBilling: a.isDefaultBilling === true,
  };
}

function projectMethod(raw: unknown): ShippingMethodOption {
  const m = asObject(raw);
  return {
    code: m.code === 'EXPRESS' ? 'EXPRESS' : 'STANDARD',
    name: str(m.name),
    description: str(m.description),
    priceInCents: num(m.priceInCents),
  };
}

// Explicit allowlist projection of the checkout state (GET /api/checkout).
export function toClientCheckout(raw: unknown): CustomerCheckoutState {
  const r = asObject(raw);
  return {
    shippingAddresses: Array.isArray(r.shippingAddresses)
      ? r.shippingAddresses.map(projectAddress)
      : [],
    billingAddresses: Array.isArray(r.billingAddresses)
      ? r.billingAddresses.map(projectAddress)
      : [],
    defaultShippingId: nullableStr(r.defaultShippingId),
    defaultBillingId: nullableStr(r.defaultBillingId),
    shippingMethods: Array.isArray(r.shippingMethods)
      ? r.shippingMethods.map(projectMethod)
      : [],
    defaultShippingMethodCode: r.defaultShippingMethodCode === 'EXPRESS' ? 'EXPRESS' : 'STANDARD',
    subtotalInCents: num(r.subtotalInCents),
    taxInCents: num(r.taxInCents),
    totalInCents: num(r.totalInCents),
  };
}

// The order-create response only needs the order id (the client redirects to the
// order page, which fetches the full order separately). Nothing else is exposed.
export function toClientOrder(raw: unknown): { id: string } {
  return { id: str(asObject(raw).id) };
}

// 401/403 → safe session message; other 4xx → the API's user-facing `message`
// (never statusText / internal errors); anything else → generic 503.
export async function forwardApiError(apiRes: Response): Promise<NextResponse> {
  if (apiRes.status === 401 || apiRes.status === 403) {
    return NextResponse.json({ error: SESSION_EXPIRED }, { status: 401 });
  }
  if (apiRes.status >= 400 && apiRes.status < 500) {
    let message = GENERIC_ERROR;
    try {
      const data = (await apiRes.json()) as { message?: unknown };
      if (typeof data.message === 'string' && data.message.length > 0) {
        message = data.message;
      }
    } catch {
      // keep generic
    }
    return NextResponse.json({ error: message }, { status: apiRes.status });
  }
  return NextResponse.json({ error: GENERIC_ERROR }, { status: 503 });
}
