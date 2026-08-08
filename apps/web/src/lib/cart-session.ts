import 'server-only';
import type { NextRequest, NextResponse } from 'next/server';
import { getApiUrl } from './auth';

// Phase 11G-alpha/beta: the cart session lives in an httpOnly cookie, and the
// SERVER (the API) is the sole authority that generates the session id. The BFF
// never mints a session id; it only reads the cookie to RESOLVE an existing cart,
// and — when a cart must be created — takes the id the API generated and stores it
// in the cookie. The client can neither read nor choose the cart session.

const isProd = process.env.NODE_ENV === 'production';

export const CART_SESSION_COOKIE = 'morer_cart_session';

// The cart session id is always a server-generated UUID. Any cookie value that is
// not a well-formed UUID is malformed/manipulated and must be treated as absent.
const CART_SESSION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProd,
  path: '/' as const,
  maxAge: 60 * 60 * 24 * 30, // 30 days
};

// Reads the current cart session id from the request cookie. Returns the value
// ONLY if it is a well-formed UUID; a missing, malformed or manipulated value
// (e.g. "session-manipulada-123") yields null and is never used.
export function readCartSession(request: NextRequest): string | null {
  const value = request.cookies.get(CART_SESSION_COOKIE)?.value;
  return typeof value === 'string' && CART_SESSION_UUID.test(value) ? value : null;
}

// Persists the httpOnly cart session cookie (the id the API generated).
export function setCartSessionCookie(response: NextResponse, sessionId: string): void {
  response.cookies.set(CART_SESSION_COOKIE, sessionId, COOKIE_OPTIONS);
}

// Resolves the current session's ACTIVE cart id via the cart API, or null if none.
// The API scopes the lookup to this sessionId, so it never returns another session's cart.
export async function resolveActiveCartId(sessionId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${getApiUrl()}/cart/session/${encodeURIComponent(sessionId)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null; // 404 = no active cart for this session
    const cart = (await res.json()) as { id?: unknown };
    return typeof cart.id === 'string' ? cart.id : null;
  } catch {
    return null;
  }
}

// Returns the ACTIVE cart id bound to the current session cookie, or null when the
// cookie is missing/malformed or resolves to no active cart. Never creates or
// generates anything — creating a cart (and its session id) is the API's job.
export async function resolveExistingCartId(request: NextRequest): Promise<string | null> {
  const sessionId = readCartSession(request);
  return sessionId ? resolveActiveCartId(sessionId) : null;
}
