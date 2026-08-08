import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl } from '@/lib/auth';
import { checkCsrf } from '@/lib/csrf';
import {
  resolveCartSessionForWrite,
  setCartSessionCookie,
} from '@/lib/cart-session';
import { CART_GENERIC_ERROR, forwardCartError, pickAddItem, toClientCart } from '@/lib/cart-bff';

// Adds an item to the current session's cart. The cart is bound to the session
// resolved from the httpOnly cookie; a NEW cart is only ever created with a
// server-generated id (never a client-chosen / malformed / unknown value). The
// body may carry only { variantId, quantity }.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  const { sessionId, existingCartId, isNew } = await resolveCartSessionForWrite(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    // Reuse the session's existing cart, or create one bound to the server-issued id.
    let cartId = existingCartId;
    if (!cartId) {
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
      cartId = cart.id;
    }

    const addRes = await fetch(`${getApiUrl()}/cart/${cartId}/items`, {
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
