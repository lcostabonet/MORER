import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl } from '@/lib/auth';
import { checkCsrf } from '@/lib/csrf';
import { orderAuthHeaders } from '@/lib/order-access';
import { forwardOrderApiError } from '@/lib/order-bff';

// Phase 11H: cancelling is a sensitive mutation, proxied so the API can enforce
// order ownership (JWT owner or guest capability). Only the resulting status is
// returned — never the full order.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> },
): Promise<NextResponse> {
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  const { orderId } = await context.params;

  try {
    const apiRes = await fetch(
      `${getApiUrl()}/checkout/orders/${encodeURIComponent(orderId)}/cancel`,
      {
        method: 'POST',
        headers: { ...orderAuthHeaders(request.cookies, orderId) },
      },
    );
    if (!apiRes.ok) return await forwardOrderApiError(apiRes);
    const data = (await apiRes.json()) as { status?: unknown };
    return NextResponse.json(
      { status: typeof data.status === 'string' ? data.status : 'CANCELLED' },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ message: 'No se ha podido cancelar el pedido.' }, { status: 503 });
  }
}
