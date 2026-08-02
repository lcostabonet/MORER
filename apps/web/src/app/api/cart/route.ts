import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl } from '@/lib/auth';
import {
  getOrCreateCartSession,
  setCartSessionCookie,
} from '@/lib/cart-session';
import { CART_GENERIC_ERROR, toClientCart } from '@/lib/cart-bff';

// Returns the ACTIVE cart for the current session cookie, or { cart: null } when
// there is none. Creates the httpOnly session cookie on first visit. The cart is
// derived server-side from the cookie — never from a client-supplied id.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { sessionId, isNew } = getOrCreateCartSession(request);

  let response: NextResponse;
  if (isNew) {
    // Brand-new session → no cart exists yet.
    response = NextResponse.json({ cart: null }, { status: 200 });
  } else {
    try {
      const apiRes = await fetch(
        `${getApiUrl()}/cart/session/${encodeURIComponent(sessionId)}`,
        { cache: 'no-store' },
      );
      if (apiRes.status === 404) {
        response = NextResponse.json({ cart: null }, { status: 200 });
      } else if (!apiRes.ok) {
        response = NextResponse.json({ error: CART_GENERIC_ERROR }, { status: 503 });
      } else {
        const cart = (await apiRes.json()) as unknown;
        response = NextResponse.json({ cart: toClientCart(cart) }, { status: 200 });
      }
    } catch {
      response = NextResponse.json({ error: CART_GENERIC_ERROR }, { status: 503 });
    }
  }

  if (isNew) setCartSessionCookie(response, sessionId);
  return response;
}
