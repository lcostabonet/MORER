// Phase 11H — Order access capability (Option 1 + 2).
//
// An Order is a RESOURCE identified by `orderId`; it must never double as the
// CREDENTIAL that authorizes access. Authorization is decided here:
//
//   • Registered orders  → the JWT owner: order.customerId === authenticated user id.
//                          (A valid JWT always maps to a fully-registered customer,
//                           enforced by JwtStrategy, so a JWT ⇒ registered.)
//   • Guest orders       → a high-entropy capability token whose SHA-256 matches the
//                          stored Order.accessTokenHash (constant-time compare).
//
// The plaintext token is generated server-side with a CSPRNG, handed to the owner
// ONCE (guest checkout response / verified lookup), and NEVER stored — only its
// hash lives in the DB. Any unauthorized caller (unknown order, missing token,
// wrong token, foreign order) gets the SAME 404 surface: no existence disclosure.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export interface OrderAccessCredential {
  /** Plaintext capability — returned to the owner exactly once; never persisted. */
  token: string;
  /** SHA-256 hex of `token` — the ONLY value stored (Order.accessTokenHash). */
  hash: string;
}

// 32 CSPRNG bytes → base64url. ~256 bits of entropy: not guessable, not enumerable.
export function generateOrderAccessToken(): OrderAccessCredential {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashOrderAccessToken(token) };
}

export function hashOrderAccessToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

// Constant-time comparison of a presented token against a stored SHA-256 hex hash.
// Returns false on any missing/malformed input without leaking timing information.
export function orderAccessTokenMatches(
  token: string | null | undefined,
  storedHash: string | null | undefined,
): boolean {
  if (typeof token !== 'string' || token.length === 0) return false;
  if (typeof storedHash !== 'string' || storedHash.length === 0) return false;
  let stored: Buffer;
  try {
    stored = Buffer.from(storedHash, 'hex');
  } catch {
    return false;
  }
  const presented = Buffer.from(hashOrderAccessToken(token), 'hex');
  if (presented.length === 0 || presented.length !== stored.length) return false;
  return timingSafeEqual(presented, stored);
}

// The minimal Order shape needed for an authorization decision.
export interface OrderAccessRow {
  customerId: string;
  accessTokenHash: string | null;
}

export interface OrderAccessCredentials {
  /** Authenticated customer id from a validated JWT (⇒ registered). */
  userId?: string | null;
  /** Capability token presented via the X-Order-Access-Token header. */
  token?: string | null;
}

// Central access decision. True iff the caller is the registered JWT owner OR holds
// a valid guest capability for this order. Everything else is false → caller maps it
// to a uniform 404.
export function isOrderAccessAuthorized(
  order: OrderAccessRow,
  cred: OrderAccessCredentials,
): boolean {
  // Registered-owner path. A JWT is only ever issued to a registered customer, so a
  // customerId match here means the authenticated owner is operating on their order.
  if (cred.userId && order.customerId === cred.userId) return true;
  // Guest capability path. Registered orders carry no accessTokenHash, so this only
  // succeeds for guest orders that were issued a capability.
  if (orderAccessTokenMatches(cred.token, order.accessTokenHash)) return true;
  return false;
}
