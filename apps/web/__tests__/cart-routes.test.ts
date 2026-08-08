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

  it('returns { cart: null } and issues NO cookie on a first visit (read-only)', async () => {
    const res = await mod.GET(makeRequest('GET', '/api/cart'));
    expect(res.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled(); // no session → nothing to fetch
    expect((await res.json()).cart).toBeNull();
    // The cookie is created only when the API creates a cart — never on a read.
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('treats a malformed cookie as no session (no cart, no fetch, no cookie)', async () => {
    const res = await mod.GET(
      makeRequest('GET', '/api/cart', undefined, { [CART_SESSION_COOKIE]: 'session-manipulada-123' }),
    );
    expect(res.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
    expect((await res.json()).cart).toBeNull();
    expect(res.headers.get('set-cookie')).toBeNull();
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

  // ── Phase 11G-beta: the API generates the session id; the BFF stores it ──────

  const API_SESSION = 'a1111111-1111-4111-8111-111111111111';
  const VALID_UNKNOWN = 'c0000000-0000-4000-8000-0000000000ff';

  // G. No cookie → BFF asks the API to create (empty body) → Set-Cookie(API id).
  it('creates a cart via the API with an EMPTY body and Set-Cookies the API-generated id', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(fetchRes(200, { id: 'new-cart', sessionId: API_SESSION })) // POST /cart {}
      .mockResolvedValueOnce(fetchRes(200, CART_BODY)); // add item
    // The client tries to inject a sessionId/cartId — both must be ignored.
    const req = makeRequest('POST', '/api/cart/items', { variantId: 'v1', quantity: 1, sessionId: 'evil', cartId: 'evil' });
    const res = await mod.POST(req);
    expect(res.status).toBe(200);

    const [createUrl, createOpts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(createUrl).toMatch(/\/cart$/);
    expect(createOpts.method).toBe('POST');
    expect(JSON.parse(String(createOpts.body))).toEqual({}); // BFF sends NO id
    const [addUrl] = (fetch as ReturnType<typeof vi.fn>).mock.calls[1] as [string, RequestInit];
    expect(addUrl).toContain('/cart/new-cart/items');

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${CART_SESSION_COOKIE}=${API_SESSION}`);
    expect(setCookie.toLowerCase()).toContain('httponly');
    expect(setCookie).not.toContain('evil');
    const { cart } = (await res.json()) as { cart: Record<string, unknown> };
    expect(cart).not.toHaveProperty('sessionId');
  });

  // H. Malformed cookie → ignored → new cart created via API, cookie replaced.
  it('ignores a malformed cookie and creates a fresh cart via the API', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(fetchRes(200, { id: 'new-cart', sessionId: API_SESSION }))
      .mockResolvedValueOnce(fetchRes(200, CART_BODY));
    const req = makeRequest('POST', '/api/cart/items', { variantId: 'v1', quantity: 1 }, { [CART_SESSION_COOKIE]: 'session-manipulada-123' });
    const res = await mod.POST(req);
    expect(res.status).toBe(200);
    // First call is the create (no resolve, since the malformed cookie is rejected).
    const [createUrl, createOpts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(createUrl).toMatch(/\/cart$/);
    expect(JSON.parse(String(createOpts.body))).toEqual({});
    expect((res.headers.get('set-cookie') ?? '')).toContain(`${CART_SESSION_COOKIE}=${API_SESSION}`);
  });

  // I. Valid-but-unknown UUID cookie → NOT sent as sessionId; API generates a new one.
  it('does not adopt a valid-but-unknown UUID cookie; the API generates a different id', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(fetchRes(404, {})) // resolve by session → no active cart
      .mockResolvedValueOnce(fetchRes(200, { id: 'new-cart', sessionId: API_SESSION })) // POST /cart {}
      .mockResolvedValueOnce(fetchRes(200, CART_BODY)); // add item
    const req = makeRequest('POST', '/api/cart/items', { variantId: 'v1', quantity: 1 }, { [CART_SESSION_COOKIE]: VALID_UNKNOWN });
    const res = await mod.POST(req);
    expect(res.status).toBe(200);

    const [resolveUrl] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(resolveUrl).toContain(`/cart/session/${VALID_UNKNOWN}`);
    const [createUrl, createOpts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[1] as [string, RequestInit];
    expect(createUrl).toMatch(/\/cart$/);
    expect(JSON.parse(String(createOpts.body))).toEqual({}); // the client's UUID is NOT forwarded
    // Cookie is replaced with the API id, not the client's chosen UUID.
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${CART_SESSION_COOKIE}=${API_SESSION}`);
    expect(setCookie).not.toContain(VALID_UNKNOWN);
  });

  // J. Legit ACTIVE cookie → reuse, no create, no rotation.
  it('reuses a legit ACTIVE cart without creating or rotating the session', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(fetchRes(200, { id: CART_ID })) // resolve → active cart
      .mockResolvedValueOnce(fetchRes(200, CART_BODY)); // add
    const res = await mod.POST(makeRequest('POST', '/api/cart/items', { variantId: 'v1', quantity: 1 }, WITH_SESSION));
    expect(res.status).toBe(200);
    // No POST /cart create call.
    const createCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => /\/cart$/.test(c[0] as string) && (c[1] as RequestInit)?.method === 'POST',
    );
    expect(createCall).toBeUndefined();
    // No rotation — the cookie is not re-set.
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  // K. Two clients sending the same valid-but-unknown UUID never share a cart.
  it('two clients with the same invented UUID get distinct API-generated carts', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(fetchRes(404, {}))
      .mockResolvedValueOnce(fetchRes(200, { id: 'cart-A', sessionId: 'aaaaaaaa-0000-4000-8000-000000000001' }))
      .mockResolvedValueOnce(fetchRes(200, CART_BODY));
    const resA = await mod.POST(makeRequest('POST', '/api/cart/items', { variantId: 'v1', quantity: 1 }, { [CART_SESSION_COOKIE]: VALID_UNKNOWN }));
    const setA = resA.headers.get('set-cookie') ?? '';
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetch)
      .mockResolvedValueOnce(fetchRes(404, {}))
      .mockResolvedValueOnce(fetchRes(200, { id: 'cart-B', sessionId: 'bbbbbbbb-0000-4000-8000-000000000002' }))
      .mockResolvedValueOnce(fetchRes(200, CART_BODY));
    const resB = await mod.POST(makeRequest('POST', '/api/cart/items', { variantId: 'v1', quantity: 1 }, { [CART_SESSION_COOKIE]: VALID_UNKNOWN }));
    const setB = resB.headers.get('set-cookie') ?? '';

    expect(setA).toContain('aaaaaaaa-0000-4000-8000-000000000001');
    expect(setB).toContain('bbbbbbbb-0000-4000-8000-000000000002');
    expect(setA).not.toBe(setB); // distinct carts → no sharing
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
