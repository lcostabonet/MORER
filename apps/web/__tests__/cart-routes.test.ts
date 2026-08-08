/**
 * BFF Route Handler tests for Phase 11G-alpha cookie-based cart.
 * The cart is operated via the httpOnly morer_cart_session cookie; the client
 * never supplies a sessionId or cartId.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { CART_SESSION_COOKIE } from '@/lib/cart-session';

const CART_SESSION = 'b0000000-0000-4000-8000-000000000002';
const CART_ID = 'cart-1';

function makeRequest(
  method: string,
  url: string,
  body?: unknown,
  cookies: Record<string, string> = {},
  extraHeaders: Record<string, string> = {},
): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extraHeaders };
  const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  if (cookieHeader) headers['cookie'] = cookieHeader;
  return new NextRequest(new URL(url, 'http://localhost'), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function fetchRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const WITH_SESSION = { [CART_SESSION_COOKIE]: CART_SESSION };
// The upstream API cart includes sessionId (= the httpOnly cookie value). The BFF
// MUST strip it before returning to the client.
const CART_BODY = { id: CART_ID, sessionId: CART_SESSION, status: 'ACTIVE', items: [{ id: 'i1' }], subtotalInCents: 1000 };
const CLIENT_CART = { id: CART_ID, status: 'ACTIVE', items: [{ id: 'i1' }], subtotalInCents: 1000 };

// ─── GET /api/cart ────────────────────────────────────────────────────────────

describe('GET /api/cart', () => {
  let mod: typeof import('@/app/api/cart/route');
  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn());
    mod = await import('@/app/api/cart/route');
  });
  afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); });

  it('creates an httpOnly session cookie on first visit and returns no cart', async () => {
    const res = await mod.GET(makeRequest('GET', '/api/cart'));
    expect(res.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled(); // brand-new session → no cart to fetch
    expect((await res.json()).cart).toBeNull();
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(CART_SESSION_COOKIE);
    expect(setCookie.toLowerCase()).toContain('httponly');
  });

  it('returns the cart for the existing session cookie WITHOUT leaking sessionId', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(fetchRes(200, CART_BODY));
    const res = await mod.GET(makeRequest('GET', '/api/cart', undefined, WITH_SESSION));
    expect(res.status).toBe(200);
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toContain(`/cart/session/${CART_SESSION}`);
    const { cart } = (await res.json()) as { cart: Record<string, unknown> };
    // The httpOnly session id is stripped at the BFF boundary — never reaches client JS.
    expect(cart).toEqual(CLIENT_CART);
    expect(cart).not.toHaveProperty('sessionId');
  });

  it('returns { cart: null } when the session has no active cart', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(fetchRes(404, {}));
    const res = await mod.GET(makeRequest('GET', '/api/cart', undefined, WITH_SESSION));
    expect(res.status).toBe(200);
    expect((await res.json()).cart).toBeNull();
  });
});

// ─── POST /api/cart/items ─────────────────────────────────────────────────────

describe('POST /api/cart/items', () => {
  let mod: typeof import('@/app/api/cart/items/route');
  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn());
    mod = await import('@/app/api/cart/items/route');
  });
  afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); });

  it('CSRF cross-site → 403 without calling backend', async () => {
    const req = makeRequest('POST', '/api/cart/items', { variantId: 'v1', quantity: 1 }, WITH_SESSION, { 'sec-fetch-site': 'cross-site' });
    expect((await mod.POST(req)).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reuses the session cart and adds only { variantId, quantity } (drops injected cartId/price)', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(fetchRes(200, { id: CART_ID })) // resolve cart by COOKIE session
      .mockResolvedValueOnce(fetchRes(200, CART_BODY)); // add item
    const req = makeRequest('POST', '/api/cart/items', {
      variantId: 'v1',
      quantity: 2,
      cartId: 'evil-cart',
      priceInCents: 1,
      sessionId: 'evil-session',
    }, WITH_SESSION);
    const res = await mod.POST(req);
    expect(res.status).toBe(200);

    // The cart is resolved by the COOKIE session — never a client-provided value.
    const [resolveUrl] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(resolveUrl).toContain(`/cart/session/${CART_SESSION}`);
    expect(resolveUrl).not.toContain('evil');

    const [addUrl, addOpts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[1] as [string, RequestInit];
    expect(addUrl).toContain(`/cart/${CART_ID}/items`);
    const sent = JSON.parse(String(addOpts.body)) as Record<string, unknown>;
    expect(sent).toEqual({ variantId: 'v1', quantity: 2 });
    expect(sent).not.toHaveProperty('cartId');
    expect(sent).not.toHaveProperty('priceInCents');
    expect(sent).not.toHaveProperty('sessionId');

    // The returned cart never leaks the httpOnly session id.
    const { cart } = (await res.json()) as { cart: Record<string, unknown> };
    expect(cart).not.toHaveProperty('sessionId');
  });

  it('forwards a controlled upstream error message (e.g. insufficient stock)', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(fetchRes(200, { id: CART_ID }))
      .mockResolvedValueOnce(fetchRes(400, { message: 'Insufficient stock. Available: 0' }));
    const res = await mod.POST(makeRequest('POST', '/api/cart/items', { variantId: 'v1', quantity: 99 }, WITH_SESSION));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Insufficient stock');
  });
});

// ─── PATCH / DELETE /api/cart/items/[itemId] ──────────────────────────────────

describe('PATCH/DELETE /api/cart/items/[itemId]', () => {
  let mod: typeof import('@/app/api/cart/items/[itemId]/route');
  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn());
    mod = await import('@/app/api/cart/items/[itemId]/route');
  });
  afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); });

  const params = { params: Promise.resolve({ itemId: 'item-1' }) };

  it('PATCH resolves the cart from the cookie and forwards only { quantity }', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(fetchRes(200, { id: CART_ID })) // resolve cart by session
      .mockResolvedValueOnce(fetchRes(200, CART_BODY)); // update
    const req = makeRequest('PATCH', '/api/cart/items/item-1', { quantity: 3, cartId: 'evil' }, WITH_SESSION);
    const res = await mod.PATCH(req, params);
    expect(res.status).toBe(200);

    const [resolveUrl] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(resolveUrl).toContain(`/cart/session/${CART_SESSION}`);
    const [updUrl, updOpts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[1] as [string, RequestInit];
    expect(updUrl).toContain(`/cart/${CART_ID}/items/item-1`);
    expect(JSON.parse(String(updOpts.body))).toEqual({ quantity: 3 });
    const { cart } = (await res.json()) as { cart: Record<string, unknown> };
    expect(cart).not.toHaveProperty('sessionId');
  });

  it('PATCH without a session cookie → 404, backend not called', async () => {
    const res = await mod.PATCH(makeRequest('PATCH', '/api/cart/items/item-1', { quantity: 3 }), params);
    expect(res.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('DELETE resolves the cart from the cookie and removes the item', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(fetchRes(200, { id: CART_ID }))
      .mockResolvedValueOnce(fetchRes(200, CART_BODY));
    const res = await mod.DELETE(makeRequest('DELETE', '/api/cart/items/item-1', undefined, WITH_SESSION), params);
    expect(res.status).toBe(200);
    const [delUrl, delOpts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[1] as [string, RequestInit];
    expect(delUrl).toContain(`/cart/${CART_ID}/items/item-1`);
    expect(delOpts.method).toBe('DELETE');
  });

  it('DELETE without a session cookie → 404', async () => {
    const res = await mod.DELETE(makeRequest('DELETE', '/api/cart/items/item-1'), params);
    expect(res.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
});
