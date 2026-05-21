import type { CartResponse } from '@/types/cart';

// NEXT_PUBLIC_ variables are baked in at build time by Next.js.
// If missing in production, fail loudly rather than silently using localhost.
function getCartApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url && process.env.NODE_ENV === 'production') {
    throw new Error(
      '[apps/web] NEXT_PUBLIC_API_URL is required in production. ' +
        'Set it before running next build.',
    );
  }
  return url ?? 'http://localhost:4000';
}

const API_URL = getCartApiUrl();

async function parseError(res: Response, fallback: string): Promise<never> {
  const data = await res.json().catch(() => ({}));
  const msg = data.message as string | string[] | undefined;
  throw new Error(Array.isArray(msg) ? msg[0] : (msg ?? fallback));
}

export async function createOrGetCart(sessionId: string): Promise<CartResponse> {
  const res = await fetch(`${API_URL}/cart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) await parseError(res, 'Error al crear el carrito');
  return res.json() as Promise<CartResponse>;
}

export async function getCartBySession(sessionId: string): Promise<CartResponse | null> {
  const res = await fetch(`${API_URL}/cart/session/${encodeURIComponent(sessionId)}`);
  if (res.status === 404) return null;
  if (!res.ok) await parseError(res, 'Error al cargar el carrito');
  return res.json() as Promise<CartResponse>;
}

export async function addCartItem(
  cartId: string,
  variantId: string,
  quantity: number,
): Promise<CartResponse> {
  const res = await fetch(`${API_URL}/cart/${cartId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ variantId, quantity }),
  });
  if (!res.ok) await parseError(res, 'Error al añadir al carrito');
  return res.json() as Promise<CartResponse>;
}

export async function updateCartItem(
  cartId: string,
  itemId: string,
  quantity: number,
): Promise<CartResponse> {
  const res = await fetch(`${API_URL}/cart/${cartId}/items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantity }),
  });
  if (!res.ok) await parseError(res, 'Error al actualizar el carrito');
  return res.json() as Promise<CartResponse>;
}

export async function removeCartItem(cartId: string, itemId: string): Promise<CartResponse> {
  const res = await fetch(`${API_URL}/cart/${cartId}/items/${itemId}`, {
    method: 'DELETE',
  });
  if (!res.ok) await parseError(res, 'Error al eliminar el item');
  return res.json() as Promise<CartResponse>;
}
