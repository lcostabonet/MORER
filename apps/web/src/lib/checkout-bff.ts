import { NextResponse } from 'next/server';

export const SESSION_EXPIRED = 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
export const GENERIC_ERROR =
  'No se ha podido procesar la solicitud. Inténtalo de nuevo.';

// The only fields the client may set. customerId and any full address data /
// unknown property are dropped. cartId is the cart identifier (as in the guest
// contract); the address selection is by id only.
const CHECKOUT_FIELDS = [
  'cartId',
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
