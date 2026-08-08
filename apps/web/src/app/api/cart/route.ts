import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl } from '@/lib/auth';
import { readCartSession } from '@/lib/cart-session';
import { CART_GENERIC_ERROR, toClientCart } from '@/lib/cart-bff';

// Returns the ACTIVE cart for the current session cookie, or { cart: null }. Read
// only: it never issues a session cookie — the cookie is created only when the API
// creates a cart (add-to-cart). A missing/malformed cookie simply yields no cart.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const sessionId = readCartSession(request);
  if (!sessionId) {
    return NextResponse.json({ cart: null }, { status: 200 });
  }

  try {
    const apiRes = await fetch(
      `${getApiUrl()}/cart/session/${encodeURIComponent(sessionId)}`,
      { cache: 'no-store' },
    );
    if (apiRes.status === 404) {
      return NextResponse.json({ cart: null }, { status: 200 });
    }
    if (!apiRes.ok) {
      return NextResponse.json({ error: CART_GENERIC_ERROR }, { status: 503 });
    }
    const cart = (await apiRes.json()) as unknown;
    return NextResponse.json({ cart: toClientCart(cart) }, { status: 200 });
  } catch {
    return NextResponse.json({ error: CART_GENERIC_ERROR }, { status: 503 });
  }
}
