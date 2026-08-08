import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl } from '@/lib/auth';
import { checkCsrf } from '@/lib/csrf';
import { orderAuthHeaders } from '@/lib/order-access';
import { forwardOrderApiError, toClientPaymentIntent } from '@/lib/order-bff';

// Phase 11H: create-intent is proxied through the BFF so the API can authorize the
// order. The BFF forwards the session JWT and/or the per-order capability cookie
// server-to-server; the browser never handles either credential.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }
  const orderId = typeof (body as { orderId?: unknown })?.orderId === 'string'
    ? (body as { orderId: string }).orderId
    : '';
  if (!orderId) return NextResponse.json({ message: 'orderId requerido' }, { status: 400 });

  try {
    const apiRes = await fetch(`${getApiUrl()}/payments/create-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...orderAuthHeaders(request.cookies, orderId) },
      // Only the orderId is forwarded — amount/currency/metadata are server-owned.
      body: JSON.stringify({ orderId }),
    });
    if (!apiRes.ok) return await forwardOrderApiError(apiRes);
    const data = (await apiRes.json()) as unknown;
    return NextResponse.json(toClientPaymentIntent(data), { status: 200 });
  } catch {
    return NextResponse.json({ message: 'No se ha podido preparar el pago.' }, { status: 503 });
  }
}
