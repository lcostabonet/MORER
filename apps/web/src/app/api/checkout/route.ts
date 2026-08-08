import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl, COOKIE_NAME } from '@/lib/auth';
import { GENERIC_ERROR, SESSION_EXPIRED, forwardApiError, toClientCheckout } from '@/lib/checkout-bff';
import { readCartSession, resolveActiveCartId } from '@/lib/cart-session';

// Returns the authenticated customer's checkout state: addresses, shipping
// methods priced against the cart subtotal, and the money breakdown (read-only).
//
// Phase 11G-alpha: the cartId is derived SERVER-SIDE from the httpOnly cart
// session cookie — never from a client query/body. Any client-supplied ?cartId
// is ignored. The API still enforces ownership (11F-beta) as defense in depth.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: SESSION_EXPIRED }, { status: 401 });
  }

  // Derive the cartId from the httpOnly cookie only; never issue a cookie here
  // (the cookie is created by the API at cart creation). A missing/malformed
  // cookie or no active cart → no cartId (subtotal 0). Client ?cartId is ignored.
  const sessionId = readCartSession(request);
  const cartId = sessionId ? await resolveActiveCartId(sessionId) : null;
  const query = cartId ? `?cartId=${encodeURIComponent(cartId)}` : '';

  let apiRes: Response;
  try {
    apiRes = await fetch(`${getApiUrl()}/checkout/customer${query}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 503 });
  }

  if (!apiRes.ok) return forwardApiError(apiRes);

  // Explicit allowlist projection — never forward the upstream object verbatim.
  const data = (await apiRes.json()) as unknown;
  return NextResponse.json(toClientCheckout(data), { status: 200 });
}
