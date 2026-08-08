/**
 * Session-fixation reproduction for the httpOnly cart cookie (morer_cart_session).
 *
 * These tests assert the CORRECT behavior: the server is the sole authority for
 * the cart session id. A malformed or client-chosen value must NEVER be adopted
 * as the identifier used to create a cart. Run against the pre-fix code, cases
 * B/C/F FAIL (the arbitrary value is forwarded to POST /cart) — that is the bug.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { CART_SESSION_COOKIE } from '@/lib/cart-session';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MALFORMED = 'session-manipulada-123';
const VALID_UNKNOWN = 'c0000000-0000-4000-8000-0000000000ff'; // well-formed UUID, no cart

function makeRequest(cookies: Record<string, string> = {}): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  if (cookieHeader) headers['cookie'] = cookieHeader;
  return new NextRequest(new URL('/api/cart/items', 'http://localhost'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ variantId: 'v1', quantity: 1 }),
  });
}

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };

// Installs a URL-routed fetch mock modelling the cart API. `existingCart` controls
// whether GET /cart/session/:id resolves to a cart. Returns the recorded calls.
function installFetch(existingCart: string | null): Call[] {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ url, method, body });
    if (method === 'GET' && url.includes('/cart/session/')) {
      return existingCart ? jsonRes(200, { id: existingCart }) : jsonRes(404, {});
    }
    if (method === 'POST' && /\/cart$/.test(url)) {
      // The API's create-or-get. Echo back the sessionId it was handed.
      return jsonRes(200, { id: 'created-cart-id', sessionId: body?.sessionId });
    }
    if (method === 'POST' && /\/cart\/[^/]+\/items$/.test(url)) {
      return jsonRes(200, { id: 'created-cart-id', items: [{ id: 'i1' }], subtotalInCents: 1000 });
    }
    return jsonRes(500, {});
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

// The sessionId sent to the create endpoint POST /cart (undefined if none happened).
function createdWithSessionId(calls: Call[]): unknown {
  const create = calls.find((c) => c.method === 'POST' && /\/cart$/.test(c.url));
  return create?.body?.sessionId;
}

function setCookieValue(res: Response): string | null {
  const raw = res.headers.get('set-cookie');
  if (!raw) return null;
  const m = raw.match(new RegExp(`${CART_SESSION_COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}

describe('cart session fixation — morer_cart_session', () => {
  let POST: typeof import('@/app/api/cart/items/route').POST;

  beforeEach(async () => {
    ({ POST } = await import('@/app/api/cart/items/route'));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  // ── A. Cookie ausente ─────────────────────────────────────────────────────
  it('A: with no cookie, the server generates the session id (UUID) and sets it', async () => {
    const calls = installFetch(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(200); // never 500

    const created = createdWithSessionId(calls);
    expect(typeof created).toBe('string');
    expect(created as string).toMatch(UUID_RE);
    expect(setCookieValue(res)).toMatch(UUID_RE);
  });

  // ── B. Cookie malformada ──────────────────────────────────────────────────
  it('B: a malformed cookie is NEVER used to create the cart; server generates a UUID + overwrites', async () => {
    const calls = installFetch(null);
    const res = await POST(makeRequest({ [CART_SESSION_COOKIE]: MALFORMED }));
    expect(res.status).toBe(200);

    // The arbitrary value must not appear in ANY upstream call (session id nor URL).
    for (const c of calls) {
      expect(c.body?.sessionId).not.toBe(MALFORMED);
      expect(c.url).not.toContain(MALFORMED);
    }
    // The cart is created with a server-generated UUID.
    expect(createdWithSessionId(calls)).toMatch(UUID_RE);
    // Set-Cookie overwrites the invalid value with a valid UUID.
    const set = setCookieValue(res);
    expect(set).toMatch(UUID_RE);
    expect(set).not.toBe(MALFORMED);
  });

  // ── C. UUID válido pero desconocido ───────────────────────────────────────
  it('C: a well-formed but unknown UUID is not adopted; a different UUID is generated', async () => {
    const calls = installFetch(null); // GET /cart/session → 404 (unknown)
    const res = await POST(makeRequest({ [CART_SESSION_COOKIE]: VALID_UNKNOWN }));
    expect(res.status).toBe(200);

    const created = createdWithSessionId(calls) as string;
    expect(created).toMatch(UUID_RE);
    expect(created).not.toBe(VALID_UNKNOWN); // server chose a NEW id
    const set = setCookieValue(res);
    expect(set).toMatch(UUID_RE);
    expect(set).not.toBe(VALID_UNKNOWN);
  });

  // ── D. Persistencia legítima ──────────────────────────────────────────────
  it('D: a server-issued cookie with an existing cart is reused, not rotated', async () => {
    const legit = 'd0000000-0000-4000-8000-0000000000dd';
    const calls = installFetch('existing-cart-id'); // GET /cart/session → cart exists
    const res = await POST(makeRequest({ [CART_SESSION_COOKIE]: legit }));
    expect(res.status).toBe(200);

    // No create call — the existing cart is reused.
    expect(calls.find((c) => c.method === 'POST' && /\/cart$/.test(c.url))).toBeUndefined();
    // The item is added to the resolved existing cart.
    expect(calls.some((c) => c.url.includes('/cart/existing-cart-id/items'))).toBe(true);
    // No rotation: the cookie is not re-set.
    expect(setCookieValue(res)).toBeNull();
  });

  // ── F. Reutilización del mismo valor MALFORMADO por dos clientes ───────────
  it('F: two clients sending the same malformed value do NOT share a cart', async () => {
    const callsA = installFetch(null);
    const resA = await POST(makeRequest({ [CART_SESSION_COOKIE]: MALFORMED }));
    const idA = createdWithSessionId(callsA) as string;
    vi.restoreAllMocks();

    const callsB = installFetch(null);
    const resB = await POST(makeRequest({ [CART_SESSION_COOKIE]: MALFORMED }));
    const idB = createdWithSessionId(callsB) as string;

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(idA).toMatch(UUID_RE);
    expect(idB).toMatch(UUID_RE);
    // Distinct server-generated ids → not the same cart, no sharing.
    expect(idA).not.toBe(idB);
    expect(idA).not.toBe(MALFORMED);
    expect(idB).not.toBe(MALFORMED);
  });
});
