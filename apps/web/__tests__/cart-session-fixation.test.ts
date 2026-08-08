/**
 * Session-fixation reproduction for the httpOnly cart cookie (morer_cart_session).
 *
 * Phase 11G-beta: the API is the sole authority for a cart's session id. The BFF
 * NEVER sends a session id when creating a cart — it POSTs /cart with an EMPTY body
 * and stores the id the API returns. So a malformed / chosen / unknown cookie value
 * can never be used to create or share a cart.
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

// URL-routed fetch mock. `existingCart` controls GET /cart/session; `apiSessionId`
// is the id the API "generates" on POST /cart. Returns the recorded calls.
function installFetch(existingCart: string | null, apiSessionId: string): Call[] {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ url, method, body });
    if (method === 'GET' && url.includes('/cart/session/')) {
      return existingCart ? jsonRes(200, { id: existingCart }) : jsonRes(404, {});
    }
    if (method === 'POST' && /\/cart$/.test(url)) {
      // The API generates the id itself; it ignores whatever (empty) body arrives.
      return jsonRes(200, { id: 'created-cart-id', sessionId: apiSessionId });
    }
    if (method === 'POST' && /\/cart\/[^/]+\/items$/.test(url)) {
      return jsonRes(200, { id: 'created-cart-id', items: [{ id: 'i1' }], subtotalInCents: 1000 });
    }
    return jsonRes(500, {});
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

function createCall(calls: Call[]): Call | undefined {
  return calls.find((c) => c.method === 'POST' && /\/cart$/.test(c.url));
}
function setCookieValue(res: Response): string | null {
  const raw = res.headers.get('set-cookie');
  if (!raw) return null;
  const m = raw.match(new RegExp(`${CART_SESSION_COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}

describe('cart session fixation — morer_cart_session (11G-beta, API authority)', () => {
  let POST: typeof import('@/app/api/cart/items/route').POST;

  beforeEach(async () => {
    ({ POST } = await import('@/app/api/cart/items/route'));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  // A. No cookie → API creates + issues the id; BFF sends an EMPTY body.
  it('A: with no cookie, the API generates the id (BFF sends no session id) and it is stored', async () => {
    const calls = installFetch(null, 'a0000000-0000-4000-8000-00000000000a');
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const create = createCall(calls);
    expect(create?.body).toEqual({}); // BFF never supplies a session id
    expect(setCookieValue(res)).toMatch(UUID_RE);
    expect(setCookieValue(res)).toBe('a0000000-0000-4000-8000-00000000000a');
  });

  // B. Malformed cookie → ignored; API creates; cookie replaced. Value never sent.
  it('B: a malformed cookie is never used; the API creates the cart and overwrites the cookie', async () => {
    const calls = installFetch(null, 'b0000000-0000-4000-8000-00000000000b');
    const res = await POST(makeRequest({ [CART_SESSION_COOKIE]: MALFORMED }));
    expect(res.status).toBe(200);
    for (const c of calls) {
      expect(c.body?.sessionId).toBeUndefined();
      expect(c.url).not.toContain(MALFORMED);
    }
    expect(createCall(calls)?.body).toEqual({});
    const set = setCookieValue(res);
    expect(set).toMatch(UUID_RE);
    expect(set).not.toBe(MALFORMED);
  });

  // C. Valid-but-unknown UUID → not adopted; API generates a different id.
  it('C: a well-formed but unknown UUID is not adopted; the API generates a different id', async () => {
    const calls = installFetch(null, 'c1111111-1111-4111-8111-11111111111c');
    const res = await POST(makeRequest({ [CART_SESSION_COOKIE]: VALID_UNKNOWN }));
    expect(res.status).toBe(200);
    // The client's UUID is never forwarded as a session id.
    expect(createCall(calls)?.body).toEqual({});
    for (const c of calls) expect(c.body?.sessionId).toBeUndefined();
    const set = setCookieValue(res);
    expect(set).toMatch(UUID_RE);
    expect(set).not.toBe(VALID_UNKNOWN);
    expect(set).toBe('c1111111-1111-4111-8111-11111111111c');
  });

  // D. Legit ACTIVE cookie → reuse; no create; no rotation.
  it('D: a server-issued cookie with an existing cart is reused, not rotated', async () => {
    const legit = 'd0000000-0000-4000-8000-0000000000dd';
    const calls = installFetch('existing-cart-id', 'unused');
    const res = await POST(makeRequest({ [CART_SESSION_COOKIE]: legit }));
    expect(res.status).toBe(200);
    expect(createCall(calls)).toBeUndefined(); // reused; no creation
    expect(calls.some((c) => c.url.includes('/cart/existing-cart-id/items'))).toBe(true);
    expect(setCookieValue(res)).toBeNull(); // no rotation
  });

  // F. Two clients with the same malformed value never share a cart.
  it('F: two clients sending the same malformed value get distinct API carts', async () => {
    const callsA = installFetch(null, 'f1111111-1111-4111-8111-11111111111a');
    const resA = await POST(makeRequest({ [CART_SESSION_COOKIE]: MALFORMED }));
    const idA = setCookieValue(resA);
    vi.restoreAllMocks();

    const callsB = installFetch(null, 'f2222222-2222-4222-8222-22222222222b');
    const resB = await POST(makeRequest({ [CART_SESSION_COOKIE]: MALFORMED }));
    const idB = setCookieValue(resB);

    expect(createCall(callsA)?.body).toEqual({});
    expect(createCall(callsB)?.body).toEqual({});
    expect(idA).toMatch(UUID_RE);
    expect(idB).toMatch(UUID_RE);
    expect(idA).not.toBe(idB); // distinct API-generated ids → no sharing
  });
});
