/**
 * BFF Route Handler tests for Phase 11E-alpha authenticated checkout.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth';

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

  it('missing cookie → 401 with a safe message (never "Unauthorized")', async () => {
    const res = await mod.GET(makeRequest('GET', '/api/checkout'));
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).not.toBe('Unauthorized');
  });

  it('forwards the Bearer token and returns the checkout state', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(200, { shippingAddresses: [], billingAddresses: [], defaultShippingId: null, defaultBillingId: null }),
    );
    const res = await mod.GET(makeRequest('GET', '/api/checkout', undefined, { [COOKIE_NAME]: 'tok' }));
    expect(res.status).toBe(200);
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/checkout/customer');
    expect((options.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
  });

  it('upstream 401 → 401 safe message', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse(401, { message: 'Unauthorized' }));
    const res = await mod.GET(makeRequest('GET', '/api/checkout', undefined, { [COOKIE_NAME]: 'tok' }));
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
    cartId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    shippingAddressId: 'addr-1',
    billingAddressId: 'addr-2',
    useShippingAsBilling: false,
  };

  it('CSRF cross-site → 403 without calling backend', async () => {
    const req = makeRequest('POST', '/api/checkout/orders', VALID, { [COOKIE_NAME]: 'tok' }, { 'sec-fetch-site': 'cross-site' });
    const res = await mod.POST(req);
    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('missing cookie → 401', async () => {
    const res = await mod.POST(makeRequest('POST', '/api/checkout/orders', VALID));
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('success forwards Bearer + only whitelisted fields (drops injected customerId/address data)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse(201, { id: 'order-1' }));
    const req = makeRequest('POST', '/api/checkout/orders', {
      ...VALID,
      customerId: 'evil',
      shippingAddress: { line1: 'evil st' },
      totalInCents: 1,
    }, { [COOKIE_NAME]: 'tok' });
    const res = await mod.POST(req);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'order-1' });

    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/checkout/customer/from-cart');
    expect((options.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
    const forwarded = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(Object.keys(forwarded).sort()).toEqual(
      ['billingAddressId', 'cartId', 'shippingAddressId', 'useShippingAsBilling'].sort(),
    );
    expect(forwarded).not.toHaveProperty('customerId');
    expect(forwarded).not.toHaveProperty('shippingAddress');
    expect(forwarded).not.toHaveProperty('totalInCents');
  });

  it('upstream 400 forwards the message (never the HTTP category)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(400, { message: 'La dirección de envío seleccionada no es válida.', error: 'Bad Request' }),
    );
    const res = await mod.POST(makeRequest('POST', '/api/checkout/orders', VALID, { [COOKIE_NAME]: 'tok' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('La dirección de envío seleccionada no es válida.');
    expect(body.error).not.toBe('Bad Request');
  });

  it('upstream 401 → 401 safe message', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse(401, { message: 'Unauthorized' }));
    const res = await mod.POST(makeRequest('POST', '/api/checkout/orders', VALID, { [COOKIE_NAME]: 'tok' }));
    expect(res.status).toBe(401);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).not.toBe('Unauthorized');
  });

  it('network error → 503 controlled message', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const res = await mod.POST(makeRequest('POST', '/api/checkout/orders', VALID, { [COOKIE_NAME]: 'tok' }));
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).not.toContain('ECONNREFUSED');
  });
});
