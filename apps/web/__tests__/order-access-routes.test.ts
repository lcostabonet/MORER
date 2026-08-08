/**
 * Phase 11H — BFF Route Handler tests for the order/payment credential proxy.
 *
 * The browser never holds the order credential: the BFF reads the httpOnly session
 * JWT and/or the per-order capability cookie and forwards them server-to-server as
 * Authorization / X-Order-Access-Token. For lookup, a re-minted capability is stored
 * in an httpOnly cookie and stripped from the JSON (ORDER-AUTH-20/22).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth';
import { orderAccessCookieName, orderAuthHeaders } from '@/lib/order-access';

const ORDER_ID = 'a1111111-1111-4111-8111-111111111111';
const JWT = 'jwt-token';
const CAP = 'guest-capability-xyz';

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

function apiRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function lastCall(): [string, RequestInit] {
  const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1] as [string, RequestInit];
}
function fwdHeaders(): Record<string, string> {
  return (lastCall()[1].headers ?? {}) as Record<string, string>;
}

// ─── orderAuthHeaders helper ────────────────────────────────────────────────────

describe('orderAuthHeaders', () => {
  const store = (map: Record<string, string>) => ({
    get: (n: string) => (map[n] !== undefined ? { value: map[n] } : undefined),
  });

  it('JWT cookie only → Authorization only', () => {
    const h = orderAuthHeaders(store({ [COOKIE_NAME]: JWT }), ORDER_ID);
    expect(h.Authorization).toBe(`Bearer ${JWT}`);
    expect(h['X-Order-Access-Token']).toBeUndefined();
  });

  it('capability cookie only → X-Order-Access-Token only', () => {
    const h = orderAuthHeaders(store({ [orderAccessCookieName(ORDER_ID)]: CAP }), ORDER_ID);
    expect(h['X-Order-Access-Token']).toBe(CAP);
    expect(h.Authorization).toBeUndefined();
  });

  it('both cookies → both headers; neither → empty', () => {
    const both = orderAuthHeaders(store({ [COOKIE_NAME]: JWT, [orderAccessCookieName(ORDER_ID)]: CAP }), ORDER_ID);
    expect(both.Authorization).toBe(`Bearer ${JWT}`);
    expect(both['X-Order-Access-Token']).toBe(CAP);
    expect(orderAuthHeaders(store({}), ORDER_ID)).toEqual({});
  });

  it('a capability for a DIFFERENT order is not attached', () => {
    const h = orderAuthHeaders(store({ [orderAccessCookieName('other-order')]: CAP }), ORDER_ID);
    expect(h['X-Order-Access-Token']).toBeUndefined();
  });
});

// ─── POST /api/payments/create-intent ────────────────────────────────────────────

describe('POST /api/payments/create-intent', () => {
  let mod: typeof import('@/app/api/payments/create-intent/route');
  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn());
    mod = await import('@/app/api/payments/create-intent/route');
  });
  afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); });

  it('forwards the JWT owner credential and returns only the allowlisted fields', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(apiRes(200, {
      clientSecret: 'pi_secret_x', paymentIntentId: 'pi_1', amountInCents: 5000, currency: 'eur',
      // server-only extras that must NOT reach the client:
      customerId: 'LEAK', stripeSecretKey: 'LEAK-sk', metadata: { orderId: ORDER_ID },
    }));
    const res = await mod.POST(makeRequest('POST', '/api/payments/create-intent', { orderId: ORDER_ID }, { [COOKIE_NAME]: JWT }));
    expect(res.status).toBe(200);
    expect(fwdHeaders().Authorization).toBe(`Bearer ${JWT}`);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ clientSecret: 'pi_secret_x', paymentIntentId: 'pi_1', amountInCents: 5000, currency: 'eur' });
    const raw = JSON.stringify(body);
    for (const leak of ['LEAK', 'LEAK-sk', 'metadata']) expect(raw).not.toContain(leak);
  });

  it('forwards a guest capability cookie as X-Order-Access-Token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(apiRes(200, { clientSecret: 'pi_secret_y', paymentIntentId: 'pi_2', amountInCents: 5000, currency: 'eur' }));
    await mod.POST(makeRequest('POST', '/api/payments/create-intent', { orderId: ORDER_ID }, { [orderAccessCookieName(ORDER_ID)]: CAP }));
    expect(fwdHeaders()['X-Order-Access-Token']).toBe(CAP);
    expect(fwdHeaders().Authorization).toBeUndefined();
  });

  it('only the orderId is forwarded (amount/currency never accepted from the client)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(apiRes(200, { clientSecret: 'pi_s', paymentIntentId: 'pi', amountInCents: 5000, currency: 'eur' }));
    await mod.POST(makeRequest('POST', '/api/payments/create-intent', { orderId: ORDER_ID, amount: 1, currency: 'usd', status: 'PAID' }, { [COOKIE_NAME]: JWT }));
    const sent = JSON.parse(String(lastCall()[1].body)) as Record<string, unknown>;
    expect(sent).toEqual({ orderId: ORDER_ID });
  });

  it('upstream 404 (unauthorized/unknown order) → 404 with { message }', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(apiRes(404, { message: 'Order not found' }));
    const res = await mod.POST(makeRequest('POST', '/api/payments/create-intent', { orderId: ORDER_ID }, { [COOKIE_NAME]: JWT }));
    expect(res.status).toBe(404);
    expect(((await res.json()) as Record<string, unknown>).message).toBe('Order not found');
  });

  it('CSRF cross-site → 403 without calling the API', async () => {
    const res = await mod.POST(makeRequest('POST', '/api/payments/create-intent', { orderId: ORDER_ID }, { [COOKIE_NAME]: JWT }, { 'sec-fetch-site': 'cross-site' }));
    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
});

// ─── POST /api/payments/reconcile ─────────────────────────────────────────────────

describe('POST /api/payments/reconcile', () => {
  let mod: typeof import('@/app/api/payments/reconcile/route');
  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn());
    mod = await import('@/app/api/payments/reconcile/route');
  });
  afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); });

  it('forwards credentials and returns only reconcile status flags', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(apiRes(200, { reconciled: true, alreadyPaid: false, secret: 'LEAK' }));
    const res = await mod.POST(makeRequest('POST', '/api/payments/reconcile', { orderId: ORDER_ID, paymentIntentId: 'pi_1' }, { [COOKIE_NAME]: JWT }));
    expect(res.status).toBe(200);
    expect(fwdHeaders().Authorization).toBe(`Bearer ${JWT}`);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ reconciled: true, alreadyPaid: false });
    expect(JSON.stringify(body)).not.toContain('LEAK');
  });

  it('missing paymentIntentId → 400, API not called', async () => {
    const res = await mod.POST(makeRequest('POST', '/api/payments/reconcile', { orderId: ORDER_ID }, { [COOKIE_NAME]: JWT }));
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});

// ─── POST /api/checkout/orders/[orderId]/cancel ───────────────────────────────────

describe('POST /api/checkout/orders/[orderId]/cancel', () => {
  let mod: typeof import('@/app/api/checkout/orders/[orderId]/cancel/route');
  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn());
    mod = await import('@/app/api/checkout/orders/[orderId]/cancel/route');
  });
  afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); });

  it('forwards the credential and returns only { status }', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(apiRes(200, { id: ORDER_ID, status: 'CANCELLED', customerId: 'LEAK', shippingAddressSnapshot: { fullName: 'LEAK' } }));
    const res = await mod.POST(
      makeRequest('POST', `/api/checkout/orders/${ORDER_ID}/cancel`, undefined, { [COOKIE_NAME]: JWT }),
      { params: Promise.resolve({ orderId: ORDER_ID }) },
    );
    expect(res.status).toBe(200);
    expect(fwdHeaders().Authorization).toBe(`Bearer ${JWT}`);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ status: 'CANCELLED' });
    expect(JSON.stringify(body)).not.toContain('LEAK');
  });

  it('upstream 404 (unauthorized) → 404 { message }, no PII', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(apiRes(404, { message: 'Order not found' }));
    const res = await mod.POST(
      makeRequest('POST', `/api/checkout/orders/${ORDER_ID}/cancel`, undefined, {}),
      { params: Promise.resolve({ orderId: ORDER_ID }) },
    );
    expect(res.status).toBe(404);
  });

  it('CSRF cross-site → 403 without calling the API', async () => {
    const res = await mod.POST(
      makeRequest('POST', `/api/checkout/orders/${ORDER_ID}/cancel`, undefined, { [COOKIE_NAME]: JWT }, { 'sec-fetch-site': 'cross-site' }),
      { params: Promise.resolve({ orderId: ORDER_ID }) },
    );
    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
});

// ─── POST /api/checkout/orders/lookup ─────────────────────────────────────────────

describe('POST /api/checkout/orders/lookup', () => {
  let mod: typeof import('@/app/api/checkout/orders/lookup/route');
  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn());
    mod = await import('@/app/api/checkout/orders/lookup/route');
  });
  afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); });

  it('captures a re-minted capability into an httpOnly cookie and strips it from JSON (ORDER-AUTH-20/22)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(apiRes(200, { orderId: ORDER_ID, accessToken: CAP }));
    const res = await mod.POST(makeRequest('POST', '/api/checkout/orders/lookup', { orderNumber: 'MORER-G', email: 'g@example.com' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // Token NEVER reaches client JS.
    expect(body).toEqual({ orderId: ORDER_ID });
    expect(JSON.stringify(body)).not.toContain(CAP);
    // It lands in an httpOnly cookie scoped to this order.
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${orderAccessCookieName(ORDER_ID)}=${CAP}`);
    expect(setCookie.toLowerCase()).toContain('httponly');
  });

  it('registered order (no capability) → { orderId } and no Set-Cookie', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(apiRes(200, { orderId: ORDER_ID }));
    const res = await mod.POST(makeRequest('POST', '/api/checkout/orders/lookup', { orderNumber: 'MORER-A', email: 'a@example.com' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orderId: ORDER_ID });
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('upstream 404 → 404 { message }; no cookie set', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(apiRes(404, { message: 'No hemos encontrado ningún pedido con esos datos.' }));
    const res = await mod.POST(makeRequest('POST', '/api/checkout/orders/lookup', { orderNumber: 'X', email: 'x@example.com' }));
    expect(res.status).toBe(404);
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
