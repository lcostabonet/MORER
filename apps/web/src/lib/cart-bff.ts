import { NextResponse } from 'next/server';

// Phase 11G-alpha: helpers for the cart BFF routes. The cart is operated via the
// httpOnly session cookie; the client never supplies a sessionId/cartId.

export const CART_GENERIC_ERROR =
  'No se ha podido actualizar el carrito. Inténtalo de nuevo.';

// Only these fields are accepted from the client body — never a cartId/sessionId.
const ADD_ITEM_FIELDS = ['variantId', 'quantity'] as const;
const UPDATE_ITEM_FIELDS = ['quantity'] as const;

function pick(body: unknown, fields: readonly string[]): Record<string, unknown> {
  if (typeof body !== 'object' || body === null) return {};
  const src = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in src) out[field] = src[field];
  }
  return out;
}

export function pickAddItem(body: unknown): Record<string, unknown> {
  return pick(body, ADD_ITEM_FIELDS);
}

export function pickUpdateItem(body: unknown): Record<string, unknown> {
  return pick(body, UPDATE_ITEM_FIELDS);
}

// Strips the server-only `sessionId` from a cart before it leaves the BFF. That
// value is the httpOnly cart-session cookie — it must NEVER reach client JS, or
// the httpOnly guarantee is defeated (client script could drive the cart via the
// session-scoped API). The client only needs the cart's display fields.
export function toClientCart(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object') return raw;
  const { sessionId: _sessionId, ...safe } = raw as Record<string, unknown>;
  return safe;
}

// Maps an upstream cart-API error to a safe client message — never leaks
// statusText, Prisma errors or internal details.
export async function forwardCartError(apiRes: Response): Promise<NextResponse> {
  if (apiRes.status >= 400 && apiRes.status < 500) {
    let message = CART_GENERIC_ERROR;
    try {
      const data = (await apiRes.json()) as { message?: unknown };
      const raw = Array.isArray(data.message) ? data.message[0] : data.message;
      if (typeof raw === 'string' && raw.length > 0) message = raw;
    } catch {
      // keep generic
    }
    return NextResponse.json({ error: message }, { status: apiRes.status });
  }
  return NextResponse.json({ error: CART_GENERIC_ERROR }, { status: 503 });
}
