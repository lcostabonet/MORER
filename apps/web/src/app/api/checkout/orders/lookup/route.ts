import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl } from '@/lib/auth';
import { checkCsrf } from '@/lib/csrf';
import { setOrderAccessCookie } from '@/lib/order-access';
import { forwardOrderApiError } from '@/lib/order-bff';

// Phase 11H: guest order recovery. orderNumber + email is verified by the API
// (throttled). For a guest order the API re-mints a capability; the BFF captures it
// into an httpOnly cookie and returns ONLY the orderId — the token never reaches
// client JS. The client then navigates to the (now authorized) order page.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }
  const src = (body ?? {}) as { orderNumber?: unknown; email?: unknown };
  const orderNumber = typeof src.orderNumber === 'string' ? src.orderNumber : '';
  const email = typeof src.email === 'string' ? src.email : '';

  // Preserve the client IP so the API's per-IP throttle keys on the real caller
  // (requires the API to trust the proxy) rather than the BFF host.
  const forwardedFor = request.headers.get('x-forwarded-for');

  try {
    const apiRes = await fetch(`${getApiUrl()}/checkout/orders/lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
      },
      body: JSON.stringify({ orderNumber, email }),
    });
    if (!apiRes.ok) return await forwardOrderApiError(apiRes);
    const data = (await apiRes.json()) as { orderId?: unknown; accessToken?: unknown };
    const orderId = typeof data.orderId === 'string' ? data.orderId : '';
    if (!orderId) {
      return NextResponse.json({ message: 'No hemos encontrado ningún pedido con esos datos.' }, { status: 404 });
    }
    const response = NextResponse.json({ orderId }, { status: 200 });
    if (typeof data.accessToken === 'string' && data.accessToken.length > 0) {
      setOrderAccessCookie(response, orderId, data.accessToken);
    }
    return response;
  } catch {
    return NextResponse.json({ message: 'No se ha podido consultar el pedido.' }, { status: 503 });
  }
}
