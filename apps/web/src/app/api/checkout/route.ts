import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl, COOKIE_NAME } from '@/lib/auth';
import { GENERIC_ERROR, SESSION_EXPIRED, forwardApiError, toClientCheckout } from '@/lib/checkout-bff';
import {
  getOrCreateCartSession,
  resolveActiveCartId,
  setCartSessionCookie,
} from '@/lib/cart-session';

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

  const { sessionId, isNew } = getOrCreateCartSession(request);
  const cartId = isNew ? null : await resolveActiveCartId(sessionId);
  const query = cartId ? `?cartId=${encodeURIComponent(cartId)}` : '';

  let apiRes: Response;
  try {
    apiRes = await fetch(`${getApiUrl()}/checkout/customer${query}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch {
    const res = NextResponse.json({ error: GENERIC_ERROR }, { status: 503 });
    if (isNew) setCartSessionCookie(res, sessionId);
    return res;
  }

  if (!apiRes.ok) {
    const res = await forwardApiError(apiRes);
    if (isNew) setCartSessionCookie(res, sessionId);
    return res;
  }

  // Explicit allowlist projection — never forward the upstream object verbatim.
  const data = (await apiRes.json()) as unknown;
  const res = NextResponse.json(toClientCheckout(data), { status: 200 });
  if (isNew) setCartSessionCookie(res, sessionId);
  return res;
}
