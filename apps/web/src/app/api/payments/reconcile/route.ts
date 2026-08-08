import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl } from '@/lib/auth';
import { checkCsrf } from '@/lib/csrf';
import { orderAuthHeaders } from '@/lib/order-access';
import { forwardOrderApiError, toClientReconcile } from '@/lib/order-bff';

// Phase 11H: reconcile is proxied through the BFF so the API can authorize the order
// before verifying the PaymentIntent. Credentials are forwarded server-to-server.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }
  const src = (body ?? {}) as { orderId?: unknown; paymentIntentId?: unknown };
  const orderId = typeof src.orderId === 'string' ? src.orderId : '';
  const paymentIntentId = typeof src.paymentIntentId === 'string' ? src.paymentIntentId : '';
  if (!orderId || !paymentIntentId) {
    return NextResponse.json({ message: 'orderId y paymentIntentId requeridos' }, { status: 400 });
  }

  try {
    const apiRes = await fetch(`${getApiUrl()}/payments/reconcile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...orderAuthHeaders(request.cookies, orderId) },
      body: JSON.stringify({ orderId, paymentIntentId }),
    });
    if (!apiRes.ok) return await forwardOrderApiError(apiRes);
    const data = (await apiRes.json()) as unknown;
    return NextResponse.json(toClientReconcile(data), { status: 200 });
  } catch {
    return NextResponse.json({ message: 'No se ha podido verificar el pago.' }, { status: 503 });
  }
}
