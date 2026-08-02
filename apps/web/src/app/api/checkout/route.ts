import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl, COOKIE_NAME } from '@/lib/auth';
import { GENERIC_ERROR, SESSION_EXPIRED, forwardApiError } from '@/lib/checkout-bff';

// Returns the authenticated customer's checkout state: addresses, shipping
// methods priced against the cart subtotal, and the money breakdown (read-only).
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: SESSION_EXPIRED }, { status: 401 });
  }

  // Forward only the cartId. The cart's id derives from the client's localStorage
  // session (not a server-readable cookie), so it cannot be derived here; instead
  // the API enforces cart OWNERSHIP against the authenticated customer (Phase
  // 11F-beta) and re-prices server-side. No pricing/ownership is trusted from the
  // client. Any other query param the client adds is ignored (only cartId is read).
  const cartId = request.nextUrl.searchParams.get('cartId');
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

  const data = (await apiRes.json()) as unknown;
  return NextResponse.json(data, { status: 200 });
}
