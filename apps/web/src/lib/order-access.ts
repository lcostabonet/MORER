import 'server-only';
import type { NextResponse } from 'next/server';
import { COOKIE_NAME } from './auth';

// Phase 11H — Order access capability transport (BFF side).
//
// The orderId is only a resource id; access to an order requires a credential the
// browser cannot read:
//   • registered orders → the session JWT (httpOnly `morer_auth` cookie);
//   • guest orders       → a per-order capability stored in an httpOnly cookie
//                          (`morer_oat_<orderId>`), set by the BFF from the token the
//                          API mints at guest checkout / verified lookup.
//
// The BFF (Route Handlers + Server Components) reads these httpOnly cookies and
// forwards them server-to-server to the API as `Authorization: Bearer` and
// `X-Order-Access-Token`. The capability is NEVER exposed to client JS, put in a
// URL, or stored in localStorage/sessionStorage.

const isProd = process.env.NODE_ENV === 'production';

export const ORDER_ACCESS_COOKIE_PREFIX = 'morer_oat_';

export function orderAccessCookieName(orderId: string): string {
  return `${ORDER_ACCESS_COOKIE_PREFIX}${orderId}`;
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProd,
  path: '/' as const,
  maxAge: 60 * 60 * 24 * 30, // 30 days
};

// Minimal cookie-store shape shared by NextRequest.cookies and the next/headers
// cookies() store — both expose get(name) → { value } | undefined.
export interface CookieReader {
  get(name: string): { value: string } | undefined;
}

// Persists the per-order capability as an httpOnly cookie (never readable by JS).
export function setOrderAccessCookie(response: NextResponse, orderId: string, token: string): void {
  response.cookies.set(orderAccessCookieName(orderId), token, COOKIE_OPTIONS);
}

// Builds the credential headers to forward to the API for a given order. Includes
// the session JWT when present (registered owner) and/or the per-order capability
// (guest). An unauthenticated caller with neither gets an empty object → the API
// returns 404, never leaking the order.
export function orderAuthHeaders(cookies: CookieReader, orderId: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const jwt = cookies.get(COOKIE_NAME)?.value;
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  const capability = cookies.get(orderAccessCookieName(orderId))?.value;
  if (capability) headers['X-Order-Access-Token'] = capability;
  return headers;
}
