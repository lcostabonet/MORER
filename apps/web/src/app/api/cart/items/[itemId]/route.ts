import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl } from '@/lib/auth';
import { checkCsrf } from '@/lib/csrf';
import { readCartSession, resolveActiveCartId } from '@/lib/cart-session';
import { CART_GENERIC_ERROR, forwardCartError, pickUpdateItem, toClientCart } from '@/lib/cart-bff';

const NO_CART = 'No hay un carrito activo.';

// Resolves the current session's cart id from the httpOnly cookie. Returns a
// controlled 4xx response (as `left`) when there is no session/cart.
async function resolveCart(
  request: NextRequest,
): Promise<{ cartId: string } | { error: NextResponse }> {
  const sessionId = readCartSession(request);
  if (!sessionId) {
    return { error: NextResponse.json({ error: NO_CART }, { status: 404 }) };
  }
  const cartId = await resolveActiveCartId(sessionId);
  if (!cartId) {
    return { error: NextResponse.json({ error: NO_CART }, { status: 404 }) };
  }
  return { cartId };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ itemId: string }> },
): Promise<NextResponse> {
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  const { itemId } = await context.params;
  const resolved = await resolveCart(request);
  if ('error' in resolved) return resolved.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const apiRes = await fetch(
      `${getApiUrl()}/cart/${resolved.cartId}/items/${encodeURIComponent(itemId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pickUpdateItem(body)),
      },
    );
    if (!apiRes.ok) return await forwardCartError(apiRes);
    const cart = (await apiRes.json()) as unknown;
    return NextResponse.json({ cart: toClientCart(cart) }, { status: 200 });
  } catch {
    return NextResponse.json({ error: CART_GENERIC_ERROR }, { status: 503 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ itemId: string }> },
): Promise<NextResponse> {
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  const { itemId } = await context.params;
  const resolved = await resolveCart(request);
  if ('error' in resolved) return resolved.error;

  try {
    const apiRes = await fetch(
      `${getApiUrl()}/cart/${resolved.cartId}/items/${encodeURIComponent(itemId)}`,
      { method: 'DELETE' },
    );
    if (!apiRes.ok) return await forwardCartError(apiRes);
    const cart = (await apiRes.json()) as unknown;
    return NextResponse.json({ cart: toClientCart(cart) }, { status: 200 });
  } catch {
    return NextResponse.json({ error: CART_GENERIC_ERROR }, { status: 503 });
  }
}
