import type { CartResponse } from '@/types/cart';

// Phase 11G-alpha: the cart is operated through same-origin BFF routes that read
// the httpOnly session cookie. The client no longer holds a sessionId/cartId, so
// these functions take neither. Credentials (the cookie) are sent automatically
// for same-origin requests.

async function parseError(res: Response, fallback: string): Promise<never> {
  const data = (await res.json().catch(() => ({}))) as { error?: unknown; message?: unknown };
  const msg = data.error ?? data.message;
  throw new Error(typeof msg === 'string' && msg.length > 0 ? msg : fallback);
}

// Returns the current session's cart, or null when it is empty / does not exist.
export async function getCart(): Promise<CartResponse | null> {
  const res = await fetch('/api/cart', { method: 'GET' });
  if (!res.ok) await parseError(res, 'Error al cargar el carrito');
  const data = (await res.json()) as { cart: CartResponse | null };
  return data.cart ?? null;
}

export async function addToCart(variantId: string, quantity: number): Promise<CartResponse> {
  const res = await fetch('/api/cart/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ variantId, quantity }),
  });
  if (!res.ok) await parseError(res, 'Error al añadir al carrito');
  const data = (await res.json()) as { cart: CartResponse };
  return data.cart;
}

export async function updateCartItem(itemId: string, quantity: number): Promise<CartResponse> {
  const res = await fetch(`/api/cart/items/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantity }),
  });
  if (!res.ok) await parseError(res, 'Error al actualizar el carrito');
  const data = (await res.json()) as { cart: CartResponse };
  return data.cart;
}

export async function removeCartItem(itemId: string): Promise<CartResponse> {
  const res = await fetch(`/api/cart/items/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) await parseError(res, 'Error al eliminar el item');
  const data = (await res.json()) as { cart: CartResponse };
  return data.cart;
}
