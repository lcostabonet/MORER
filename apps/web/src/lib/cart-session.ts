import 'server-only';
import { randomUUID } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { getApiUrl } from './auth';

// Phase 11G-alpha: the cart session lives in an httpOnly cookie (server-managed),
// NOT in localStorage. The client can no longer read or forge the cart session,
// and the BFF derives the cart from this cookie for every cart/checkout call.

const isProd = process.env.NODE_ENV === 'production';

export const CART_SESSION_COOKIE = 'morer_cart_session';

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProd,
  path: '/' as const,
  maxAge: 60 * 60 * 24 * 30, // 30 days
};

// Reads the current cart session id from the request cookie, or null if absent.
export function readCartSession(request: NextRequest): string | null {
  const value = request.cookies.get(CART_SESSION_COOKIE)?.value;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

// Returns the cart session id, generating a fresh one when the cookie is missing.
// `isNew` tells the caller to persist the cookie on the response via setCartSessionCookie.
export function getOrCreateCartSession(request: NextRequest): { sessionId: string; isNew: boolean } {
  const existing = readCartSession(request);
  if (existing) return { sessionId: existing, isNew: false };
  return { sessionId: randomUUID(), isNew: true };
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
