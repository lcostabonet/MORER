/**
 * BFF Route Handler tests for the authenticated checkout.
 * Phase 11G-alpha: the cartId is derived SERVER-SIDE from the httpOnly cart
 * session cookie (morer_cart_session), never from the client query/body.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth';
import { CART_SESSION_COOKIE } from '@/lib/cart-session';

const AUTH = 'tok';
const CART_SESSION = 'a0000000-0000-4000-8000-000000000001';
const RESOLVED_CART_ID = 'cart-resolved-123';

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

function makeFetchResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// Both cookies present: auth session + cart session.
const BOTH_COOKIES = { [COOKIE_NAME]: AUTH, [CART_SESSION_COOKIE]: CART_SESSION };

// The cart-session resolve fetch resolves to a cart id; use before the checkout call.
function mockResolveThen(...rest: Response[]) {
  const f = vi.mocked(fetch);
  f.mockResolvedValueOnce(makeFetchResponse(200, { id: RESOLVED_CART_ID }));
  for (const r of rest) f.mockResolvedValueOnce(r);
}

// ─── GET /api/checkout ────────────────────────────────────────────────────────

describe('GET /api/checkout', () => {
  let mod: typeof import('@/app/api/checkout/route');

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn());
    mod = await import('@/app/api/checkout/route');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('missing auth cookie → 401 with a safe message (never "Unauthorized")', async () => {
    const res = await mod.GET(makeRequest('GET', '/api/checkout'));
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).not.toBe('Unauthorized');
  });

  it('derives the cartId from the cart-session cookie and forwards the Bearer token', async () => {
    mockResolveThen(
      makeFetchResponse(200, { shippingAddresses: [], billingAddresses: [], shippingMethods: [] }),
    );
    const res = await mod.GET(makeRequest('GET', '/api/checkout', undefined, BOTH_COOKIES));
    expect(res.status).toBe(200);

    // 1st fetch resolves the cart by session; 2nd calls the checkout API.
    const [resolveUrl] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(resolveUrl).toContain(`/cart/session/${CART_SESSION}`);
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[1] as [string, RequestInit];
    expect(url).toContain(`/checkout/customer?cartId=${RESOLVED_CART_ID}`);
    expect((options.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
  });

  it('IGNORES a client ?cartId and uses the cookie-derived cart instead', async () => {
    mockResolveThen(
      makeFetchResponse(200, { shippingAddresses: [], billingAddresses: [], shippingMethods: [] }),
    );
    await mod.GET(
      makeRequest('GET', '/api/checkout?cartId=evil-cart&customerId=evil', undefined, BOTH_COOKIES),
    );
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[1] as [string, RequestInit];
    expect(url).toContain(`cartId=${RESOLVED_CART_ID}`);
    expect(url).not.toContain('evil-cart');
    expect(url).not.toContain('customerId');
  });

  it('projects the state through an allowlist: strips sessionId/customerId/internals, keeps UI data', async () => {
    mockResolveThen(makeFetchResponse(200, {
      // Fields the upstream must NEVER be allowed to leak through the BFF:
      sessionId: 'LEAK-session',
      customerId: 'LEAK-customer',
      cartId: 'LEAK-cart',
      __internalDebug: 'LEAK-debug',
      shippingAddresses: [{
        id: 'addr-1', fullName: 'Ana', phone: null, line1: 'Calle 1', line2: null,
        postalCode: '28001', city: 'Madrid', province: 'Madrid', countryCode: 'ES',
        type: 'SHIPPING', isDefaultShipping: true, isDefaultBilling: false,
        customerId: 'LEAK-customer', createdAt: '2026-01-01', updatedAt: '2026-01-01',
      }],
      billingAddresses: [],
      defaultShippingId: 'addr-1',
      defaultBillingId: null,
      shippingMethods: [{ code: 'STANDARD', name: 'Envío estándar', description: '3-5 días laborables', priceInCents: 495 }],
      defaultShippingMethodCode: 'STANDARD',
      subtotalInCents: 5500,
      taxInCents: 0,
      totalInCents: 5995,
    }));
    const res = await mod.GET(makeRequest('GET', '/api/checkout', undefined, BOTH_COOKIES));
    expect(res.status).toBe(200);
    const state = (await res.json()) as Record<string, unknown>;
    const raw = JSON.stringify(state);

    // Nothing server-only leaks anywhere in the payload.
    for (const leak of ['LEAK-session', 'LEAK-customer', 'LEAK-cart', 'LEAK-debug', '__internalDebug']) {
      expect(raw).not.toContain(leak);
    }
    expect(state).not.toHaveProperty('sessionId');
    expect(state).not.toHaveProperty('customerId');
    expect(state).not.toHaveProperty('cartId');

    // UI-required data is preserved and address internals are dropped.
    const ship = (state.shippingAddresses as Record<string, unknown>[])[0];
    expect(ship.id).toBe('addr-1');
    expect(ship.fullName).toBe('Ana');
    expect(ship).not.toHaveProperty('customerId');
    expect(ship).not.toHaveProperty('createdAt');
    expect(state.defaultShippingId).toBe('addr-1');
    expect((state.shippingMethods as Record<string, unknown>[])[0].priceInCents).toBe(495);
    expect(state.subtotalInCents).toBe(5500);
    expect(state.totalInCents).toBe(5995);
    expect(state.defaultShippingMethodCode).toBe('STANDARD');

    // No serialization artifacts.
    expect(raw).not.toContain('[object Object]');
    expect(raw).not.toContain('undefined');
  });

  it('creates the cart-session cookie when missing and sends no cartId', async () => {
    // No cart-session cookie → isNew → no resolve fetch, no cartId forwarded.
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(200, { shippingAddresses: [], billingAddresses: [], shippingMethods: [] }),
    );
    const res = await mod.GET(makeRequest('GET', '/api/checkout', undefined, { [COOKIE_NAME]: AUTH }));
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1); // only the checkout call
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/checkout/customer');
    expect(url).not.toContain('cartId');
    // A fresh httpOnly cart-session cookie is set on the response.
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(CART_SESSION_COOKIE);
    expect(setCookie.toLowerCase()).toContain('httponly');
  });

  it('upstream 401 → 401 safe message', async () => {
    mockResolveThen(makeFetchResponse(401, { message: 'Unauthorized' }));
    const res = await mod.GET(makeRequest('GET', '/api/checkout', undefined, BOTH_COOKIES));
    expect(res.status).toBe(401);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).not.toBe('Unauthorized');
  });
});

// ─── POST /api/checkout/orders ────────────────────────────────────────────────

describe('POST /api/checkout/orders', () => {
  let mod: typeof import('@/app/api/checkout/orders/route');

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn());
    mod = await import('@/app/api/checkout/orders/route');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  const VALID = {
    shippingAddressId: 'addr-1',
    billingAddressId: 'addr-2',
    useShippingAsBilling: false,
    shippingMethodCode: 'STANDARD',
  };

  it('CSRF cross-site → 403 without calling backend', async () => {
    const req = makeRequest('POST', '/api/checkout/orders', VALID, BOTH_COOKIES, { 'sec-fetch-site': 'cross-site' });
    const res = await mod.POST(req);
    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('missing auth cookie → 401', async () => {
    const res = await mod.POST(makeRequest('POST', '/api/checkout/orders', VALID));
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('no cart-session cookie → 400 (no active cart), backend not called', async () => {
    const res = await mod.POST(
      makeRequest('POST', '/api/checkout/orders', VALID, { [COOKIE_NAME]: AUTH }),
    );
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('resolve returns no active cart → 400', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse(404, {})); // resolve miss
    const res = await mod.POST(makeRequest('POST', '/api/checkout/orders', VALID, BOTH_COOKIES));
    expect(res.status).toBe(400);
    // Only the resolve attempt happened; no from-cart call.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('derives cartId from the cookie and drops any client cartId / injected fields', async () => {
    mockResolveThen(makeFetchResponse(201, { id: 'order-1' }));
    const req = makeRequest('POST', '/api/checkout/orders', {
      ...VALID,
      cartId: 'evil-cart', // must be IGNORED
      customerId: 'evil',
      shippingAddress: { line1: 'evil st' },
      totalInCents: 1,
      shippingInCents: 0,
      priceInCents: 0,
    }, BOTH_COOKIES);
    const res = await mod.POST(req);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'order-1' });

    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[1] as [string, RequestInit];
    expect(url).toContain('/checkout/customer/from-cart');
    expect((options.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
    const forwarded = JSON.parse(String(options.body)) as Record<string, unknown>;
    // cartId is the SERVER-DERIVED one, never the client's.
    expect(forwarded.cartId).toBe(RESOLVED_CART_ID);
    expect(forwarded.cartId).not.toBe('evil-cart');
    expect(Object.keys(forwarded).sort()).toEqual(
      ['billingAddressId', 'cartId', 'shippingAddressId', 'shippingMethodCode', 'useShippingAsBilling'].sort(),
    );
    expect(forwarded).not.toHaveProperty('customerId');
    expect(forwarded).not.toHaveProperty('shippingAddress');
    expect(forwarded).not.toHaveProperty('totalInCents');
    expect(forwarded).not.toHaveProperty('shippingInCents');
    expect(forwarded).not.toHaveProperty('priceInCents');
  });

  it('projects the order response to { id } only (strips any upstream internals)', async () => {
    mockResolveThen(makeFetchResponse(201, {
      id: 'order-1',
      customerId: 'LEAK-customer',
      email: 'internal@leak.local',
      shippingAddressSnapshot: { fullName: 'Ana' },
      __debug: 'LEAK-debug',
    }));
    const res = await mod.POST(makeRequest('POST', '/api/checkout/orders', VALID, BOTH_COOKIES));
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ id: 'order-1' });
    const raw = JSON.stringify(body);
    for (const leak of ['LEAK-customer', 'internal@leak.local', 'LEAK-debug', 'shippingAddressSnapshot']) {
      expect(raw).not.toContain(leak);
    }
  });

  it('upstream 400 forwards the message (never the HTTP category)', async () => {
    mockResolveThen(
      makeFetchResponse(400, { message: 'La dirección de envío seleccionada no es válida.', error: 'Bad Request' }),
    );
    const res = await mod.POST(makeRequest('POST', '/api/checkout/orders', VALID, BOTH_COOKIES));
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('La dirección de envío seleccionada no es válida.');
    expect(body.error).not.toBe('Bad Request');
  });

  it('upstream 401 → 401 safe message', async () => {
    mockResolveThen(makeFetchResponse(401, { message: 'Unauthorized' }));
    const res = await mod.POST(makeRequest('POST', '/api/checkout/orders', VALID, BOTH_COOKIES));
    expect(res.status).toBe(401);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).not.toBe('Unauthorized');
  });

  it('network error on the from-cart call → 503 controlled message', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeFetchResponse(200, { id: RESOLVED_CART_ID })) // resolve ok
      .mockRejectedValueOnce(new Error('ECONNREFUSED')); // from-cart fails
    const res = await mod.POST(makeRequest('POST', '/api/checkout/orders', VALID, BOTH_COOKIES));
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).not.toContain('ECONNREFUSED');
  });
});
