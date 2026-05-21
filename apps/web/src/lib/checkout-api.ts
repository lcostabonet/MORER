import type { OrderResponse } from '@/types/order';

// NEXT_PUBLIC_ variables are baked in at build time by Next.js.
// Follows the same pattern as cart-api.ts.
function getCheckoutApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url && process.env.NODE_ENV === 'production') {
    throw new Error(
      '[apps/web] NEXT_PUBLIC_API_URL is required in production. ' +
        'Set it before running next build.',
    );
  }
  return url ?? 'http://localhost:4000';
}

const API_URL = getCheckoutApiUrl();

async function parseError(res: Response, fallback: string): Promise<never> {
  const data = await res.json().catch(() => ({}));
  const msg = data.message as string | string[] | undefined;
  throw new Error(Array.isArray(msg) ? msg[0] : (msg ?? fallback));
}

export async function startCheckout(cartId: string): Promise<OrderResponse> {
  const res = await fetch(`${API_URL}/checkout/from-cart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cartId }),
  });
  if (!res.ok) await parseError(res, 'Error al iniciar el checkout');
  return res.json() as Promise<OrderResponse>;
}

export async function cancelCheckoutOrder(orderId: string): Promise<OrderResponse> {
  const res = await fetch(`${API_URL}/checkout/orders/${orderId}/cancel`, {
    method: 'POST',
  });
  if (!res.ok) await parseError(res, 'Error al cancelar el pedido');
  return res.json() as Promise<OrderResponse>;
}
