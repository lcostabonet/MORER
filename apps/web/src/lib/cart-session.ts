import 'server-only';
import { randomUUID } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { getApiUrl } from './auth';

// Phase 11G-alpha: the cart session lives in an httpOnly cookie (server-managed),
// NOT in localStorage. The client can no longer read or forge the cart session,
// and the BFF derives the cart from this cookie for every cart/checkout call.

const isProd = process.env.NODE_ENV === 'production';

export const CART_SESSION_COOKIE = 'morer_cart_session';

// The cart session id is always a server-generated UUID (randomUUID below). Any
// cookie value that is not a well-formed UUID is a malformed/manipulated value
// and must be treated as absent — never adopted as an identifier.
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

// Returns the cart session id for READ paths, generating a fresh server UUID when
// the cookie is missing or malformed. `isNew` tells the caller to persist (and
// thereby overwrite any invalid value) via setCartSessionCookie.
export function getOrCreateCartSession(request: NextRequest): { sessionId: string; isNew: boolean } {
  const existing = readCartSession(request);
  if (existing) return { sessionId: existing, isNew: false };
  return { sessionId: randomUUID(), isNew: true };
}

// Returns the session id to bind a cart to on a WRITE (add item). The cookie's
// session is reused ONLY when it is a valid UUID that already resolves to an
// ACTIVE cart; otherwise a fresh, cryptographically-random server id is generated
// (isNew=true → the caller must Set-Cookie). This guarantees the server — never
// the client — chooses the identifier for a NEW cart, so a chosen / malformed /
// unknown cookie value can never fixate a session or share a cart between clients.
export async function resolveCartSessionForWrite(
  request: NextRequest,
): Promise<{ sessionId: string; existingCartId: string | null; isNew: boolean }> {
  const cookieSession = readCartSession(request);
  if (cookieSession) {
    const existingCartId = await resolveActiveCartId(cookieSession);
    if (existingCartId) return { sessionId: cookieSession, existingCartId, isNew: false };
  }
  return { sessionId: randomUUID(), existingCartId: null, isNew: true };
}

// Persists the httpOnly cart session cookie on the outgoing response.
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
