// Phase 11J: the legacy guest checkout client (startCheckout → POST /checkout/from-cart)
// was removed. It was unmounted dead code whose API response carries a guest order
// capability; keeping a browser path that receives that token was an unnecessary risk.
// The remaining calls go through the same-origin BFF so the server attaches the order
// credential (session JWT / guest capability) from httpOnly cookies. For lookup, the
// BFF captures any re-minted capability into an httpOnly cookie and returns only
// { orderId } — the token never reaches client JS.

async function parseError(res: Response, fallback: string): Promise<never> {
  if (res.status === 429)
    throw new Error('Demasiados intentos. Espera un minuto e inténtalo de nuevo.');
  const data = await res.json().catch(() => ({}));
  const msg = data.message as string | string[] | undefined;
  throw new Error(Array.isArray(msg) ? msg[0] : (msg ?? fallback));
}

export async function cancelCheckoutOrder(orderId: string): Promise<{ status: string }> {
  const res = await fetch(`/api/checkout/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: 'POST',
  });
  if (!res.ok) await parseError(res, 'Error al cancelar el pedido');
  return res.json() as Promise<{ status: string }>;
}

export async function lookupOrder(
  orderNumber: string,
  email: string,
): Promise<{ orderId: string }> {
  const res = await fetch('/api/checkout/orders/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderNumber, email }),
  });
  if (!res.ok)
    await parseError(res, 'No hemos encontrado ningún pedido con esos datos.');
  return res.json() as Promise<{ orderId: string }>;
}
