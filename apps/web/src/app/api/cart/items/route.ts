import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl } from '@/lib/auth';
import { checkCsrf } from '@/lib/csrf';
import {
  getOrCreateCartSession,
  setCartSessionCookie,
} from '@/lib/cart-session';
import { CART_GENERIC_ERROR, forwardCartError, pickAddItem, toClientCart } from '@/lib/cart-bff';

// Adds an item to the current session's cart, creating the cart (and the session
// cookie) if needed. sessionId comes ONLY from the httpOnly cookie; the body may
// carry only { variantId, quantity }.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  const { sessionId, isNew } = getOrCreateCartSession(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    // Create-or-get the ACTIVE cart for this session (idempotent).
    const cartRes = await fetch(`${getApiUrl()}/cart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    if (!cartRes.ok) return await forwardCartError(cartRes);
    const cart = (await cartRes.json()) as { id?: unknown };
    if (typeof cart.id !== 'string') {
      return NextResponse.json({ error: CART_GENERIC_ERROR }, { status: 503 });
    }

    const addRes = await fetch(`${getApiUrl()}/cart/${cart.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pickAddItem(body)),
    });
    if (!addRes.ok) return await forwardCartError(addRes);

    const updated = (await addRes.json()) as unknown;
    const response = NextResponse.json({ cart: toClientCart(updated) }, { status: 200 });
    if (isNew) setCartSessionCookie(response, sessionId);
    return response;
  } catch {
    return NextResponse.json({ error: CART_GENERIC_ERROR }, { status: 503 });
  }
}
