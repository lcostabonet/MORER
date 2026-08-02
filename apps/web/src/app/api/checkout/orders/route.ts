import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl, COOKIE_NAME } from '@/lib/auth';
import { checkCsrf } from '@/lib/csrf';
import {
  GENERIC_ERROR,
  SESSION_EXPIRED,
  forwardApiError,
  pickCheckoutPayload,
  toClientOrder,
} from '@/lib/checkout-bff';
import { readCartSession, resolveActiveCartId } from '@/lib/cart-session';

const NO_CART = 'No hay un carrito activo para finalizar la compra.';

// Creates an order for the authenticated customer. Phase 11G-alpha: the cartId is
// derived SERVER-SIDE from the httpOnly session cookie (never from the client
// body). Only address selection + shipping method CODE are accepted from the body.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrfCheck = checkCsrf(request);
  if (csrfCheck) return csrfCheck;

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: SESSION_EXPIRED }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Resolve the cart from the httpOnly session cookie — the client cannot choose it.
  const sessionId = readCartSession(request);
  const cartId = sessionId ? await resolveActiveCartId(sessionId) : null;
  if (!cartId) {
    return NextResponse.json({ error: NO_CART }, { status: 400 });
  }

  let apiRes: Response;
  try {
    apiRes = await fetch(`${getApiUrl()}/checkout/customer/from-cart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      // Whitelisted client fields + the server-derived cartId. The client never
      // supplies cartId/customerId/prices.
      body: JSON.stringify({ ...pickCheckoutPayload(body), cartId }),
    });
  } catch {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 503 });
  }

  if (!apiRes.ok) return forwardApiError(apiRes);

  // Only the order id is exposed — the order page fetches the full order itself.
  const data = (await apiRes.json()) as unknown;
  return NextResponse.json(toClientOrder(data), { status: 201 });
}
