import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl } from '@/lib/auth';
import { checkCsrf } from '@/lib/csrf';
import { resolveExistingCartId, setCartSessionCookie } from '@/lib/cart-session';
import { CART_GENERIC_ERROR, forwardCartError, pickAddItem, toClientCart } from '@/lib/cart-bff';

// Adds an item to the current session's cart. Reuses the cookie's ACTIVE cart when
// present; otherwise the API creates a cart AND generates its session id, which the
// BFF stores in the httpOnly cookie. The client never supplies a sessionId/cartId.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    let cartId = await resolveExistingCartId(request);
    let newSessionId: string | null = null;

    if (!cartId) {
      // POST /cart with NO body — the API generates the session id (11G-beta).
      const cartRes = await fetch(`${getApiUrl()}/cart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!cartRes.ok) return await forwardCartError(cartRes);
      const cart = (await cartRes.json()) as { id?: unknown; sessionId?: unknown };
      if (typeof cart.id !== 'string' || typeof cart.sessionId !== 'string') {
        return NextResponse.json({ error: CART_GENERIC_ERROR }, { status: 503 });
      }
      cartId = cart.id;
      newSessionId = cart.sessionId; // server-generated; stored in the cookie below
    }

    const addRes = await fetch(`${getApiUrl()}/cart/${cartId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pickAddItem(body)),
    });
    if (!addRes.ok) return await forwardCartError(addRes);

    const updated = (await addRes.json()) as unknown;
    const response = NextResponse.json({ cart: toClientCart(updated) }, { status: 200 });
    // Persist the API-generated session id (never sent back to the browser in JSON).
    if (newSessionId) setCartSessionCookie(response, newSessionId);
    return response;
  } catch {
    return NextResponse.json({ error: CART_GENERIC_ERROR }, { status: 503 });
  }
}
