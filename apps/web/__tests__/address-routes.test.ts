/**
 * BFF Route Handler tests for Phase 11D address book.
 * global fetch is mocked; the upstream API is never hit.
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
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ctx = (addressId: string) => ({ params: Promise.resolve({ addressId }) });

const VALID_ADDRESS = {
  fullName: 'Ana García',
  line1: 'Calle Mayor 1',
  postalCode: '28001',
  city: 'Madrid',
  province: 'Madrid',
  type: 'SHIPPING',
};

// ─── Collection route: GET (list) + POST (create) ─────────────────────────────

describe('GET/POST /api/account/addresses', () => {
  let mod: typeof import('@/app/api/account/addresses/route');

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn());
    mod = await import('@/app/api/account/addresses/route');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('GET: missing cookie → 401 with a safe message (never "Unauthorized")', async () => {
    const res = await mod.GET(makeRequest('GET', '/api/account/addresses'));
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).not.toBe('Unauthorized');
  });

  it('GET: forwards the Bearer token and returns the address array', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse(200, [{ id: 'a1' }]));
    const res = await mod.GET(makeRequest('GET', '/api/account/addresses', undefined, { [COOKIE_NAME]: 'tok' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 'a1' }]);
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/customers/me/addresses');
    expect((options.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
  });

  it('GET: upstream 401 → 401 safe message', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse(401, { message: 'Unauthorized' }));
    const res = await mod.GET(makeRequest('GET', '/api/account/addresses', undefined, { [COOKIE_NAME]: 'tok' }));
    expect(res.status).toBe(401);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).not.toBe('Unauthorized');
    expect(typeof body.error).toBe('string');
  });

  it('POST: CSRF cross-site → 403 without calling backend', async () => {
    const req = makeRequest('POST', '/api/account/addresses', VALID_ADDRESS, { [COOKIE_NAME]: 'tok' }, { 'sec-fetch-site': 'cross-site' });
    const res = await mod.POST(req);
    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('POST: missing cookie → 401', async () => {
    const res = await mod.POST(makeRequest('POST', '/api/account/addresses', VALID_ADDRESS));
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('POST: success forwards only whitelisted fields (drops injected customerId)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse(201, { id: 'a1' }));
    const req = makeRequest('POST', '/api/account/addresses', {
      ...VALID_ADDRESS,
      customerId: 'evil',
      id: 'evil-id',
      isDefaultShipping: true,
    }, { [COOKIE_NAME]: 'tok' });
    const res = await mod.POST(req);
    expect(res.status).toBe(201);

    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const forwarded = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(forwarded).not.toHaveProperty('customerId');
    expect(forwarded).not.toHaveProperty('id');
    expect(forwarded.fullName).toBe('Ana García');
    expect(forwarded.isDefaultShipping).toBe(true);
  });

  it('POST: upstream 400 forwards the message', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(400, { message: 'Por ahora solo se admiten direcciones de España.', error: 'Bad Request' }),
    );
    const res = await mod.POST(makeRequest('POST', '/api/account/addresses', VALID_ADDRESS, { [COOKIE_NAME]: 'tok' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('Por ahora solo se admiten direcciones de España.');
    expect(body.error).not.toBe('Bad Request');
  });
});

// ─── Item route: PATCH + DELETE ───────────────────────────────────────────────

describe('PATCH/DELETE /api/account/addresses/[addressId]', () => {
  let mod: typeof import('@/app/api/account/addresses/[addressId]/route');

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn());
    mod = await import('@/app/api/account/addresses/[addressId]/route');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('PATCH: CSRF cross-site → 403', async () => {
    const req = makeRequest('PATCH', '/api/account/addresses/a1', { city: 'X' }, { [COOKIE_NAME]: 'tok' }, { 'sec-fetch-site': 'cross-site' });
    const res = await mod.PATCH(req, ctx('a1'));
    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('PATCH: forwards filtered body to the id-scoped URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse(200, { id: 'a1' }));
    const req = makeRequest('PATCH', '/api/account/addresses/a1', { city: 'Sevilla', customerId: 'evil' }, { [COOKIE_NAME]: 'tok' });
    const res = await mod.PATCH(req, ctx('a1'));
    expect(res.status).toBe(200);
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/customers/me/addresses/a1');
    expect(options.method).toBe('PATCH');
    const forwarded = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(forwarded).not.toHaveProperty('customerId');
    expect(forwarded.city).toBe('Sevilla');
  });

  it('PATCH: upstream 404 forwards the message', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse(404, { message: 'Dirección no encontrada.', error: 'Not Found' }));
    const res = await mod.PATCH(makeRequest('PATCH', '/api/account/addresses/a1', { city: 'X' }, { [COOKIE_NAME]: 'tok' }), ctx('a1'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('Dirección no encontrada.');
    expect(body.error).not.toBe('Not Found');
  });

  it('DELETE: CSRF cross-site → 403', async () => {
    const req = makeRequest('DELETE', '/api/account/addresses/a1', undefined, { [COOKIE_NAME]: 'tok' }, { 'sec-fetch-site': 'cross-site' });
    const res = await mod.DELETE(req, ctx('a1'));
    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('DELETE: missing cookie → 401', async () => {
    const res = await mod.DELETE(makeRequest('DELETE', '/api/account/addresses/a1'), ctx('a1'));
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('DELETE: success forwards Bearer DELETE and returns success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse(200, { success: true }));
    const res = await mod.DELETE(makeRequest('DELETE', '/api/account/addresses/a1', undefined, { [COOKIE_NAME]: 'tok' }), ctx('a1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/customers/me/addresses/a1');
    expect(options.method).toBe('DELETE');
    expect((options.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
  });
});

// ─── Default-toggle routes ────────────────────────────────────────────────────

describe('POST /api/account/addresses/[addressId]/default-shipping|billing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it.each([
    ['default-shipping', '@/app/api/account/addresses/[addressId]/default-shipping/route'],
    ['default-billing', '@/app/api/account/addresses/[addressId]/default-billing/route'],
  ])('%s: CSRF cross-site → 403', async (_name, modPath) => {
    vi.stubGlobal('fetch', vi.fn());
    const mod = (await import(modPath)) as { POST: (r: NextRequest, c: ReturnType<typeof ctx>) => Promise<Response> };
    const req = makeRequest('POST', `/api/account/addresses/a1/${_name}`, undefined, { [COOKIE_NAME]: 'tok' }, { 'sec-fetch-site': 'cross-site' });
    const res = await mod.POST(req, ctx('a1'));
    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['default-shipping', '@/app/api/account/addresses/[addressId]/default-shipping/route'],
    ['default-billing', '@/app/api/account/addresses/[addressId]/default-billing/route'],
  ])('%s: success forwards Bearer POST', async (name, modPath) => {
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse(200, { id: 'a1' }));
    const mod = (await import(modPath)) as { POST: (r: NextRequest, c: ReturnType<typeof ctx>) => Promise<Response> };
    const res = await mod.POST(makeRequest('POST', `/api/account/addresses/a1/${name}`, undefined, { [COOKIE_NAME]: 'tok' }), ctx('a1'));
    expect(res.status).toBe(200);
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/customers/me/addresses/a1/${name}`);
    expect(options.method).toBe('POST');
    expect((options.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
  });

  it('default-shipping: missing cookie → 401', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const mod = await import('@/app/api/account/addresses/[addressId]/default-shipping/route');
    const res = await mod.POST(makeRequest('POST', '/api/account/addresses/a1/default-shipping'), ctx('a1'));
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
});
