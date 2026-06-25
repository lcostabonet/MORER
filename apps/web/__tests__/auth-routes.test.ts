/**
 * Route Handler tests for Phase 11A-beta auth routes.
 *
 * Strategy:
 * - Import each handler directly and call it with a constructed NextRequest.
 * - Mock global `fetch` with vi.fn() to avoid real HTTP calls.
 * - Inspect the returned NextResponse: status, body JSON, and cookies.
 *
 * The `server-only` import in auth.ts is resolved to a no-op stub via the
 * vitest.config.ts alias so the module loads without throwing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { isValidRedirect, COOKIE_NAME } from '@/lib/auth';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(
  method: string,
  url: string,
  body?: unknown,
  cookies: Record<string, string> = {},
): NextRequest {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  if (cookieHeader) {
    (headers as Record<string, string>)['cookie'] = cookieHeader;
  }

  return new NextRequest(new URL(url, 'http://localhost'), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function makeFetchResponse(
  status: number,
  body: unknown,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Login route ─────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  let handler: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn());
    // Re-import the handler fresh for each test to avoid cached fetch mock state.
    const mod = await import('@/app/api/auth/login/route');
    handler = mod.POST;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('success: sets httpOnly cookie and does NOT include accessToken in response body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(200, { accessToken: 'mock-jwt-token' }),
    );

    const req = makeRequest('POST', '/api/auth/login', {
      email: 'user@example.com',
      password: 'password123',
    });

    const res = await handler(req);
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty('accessToken');
    expect(body.success).toBe(true);

    // Cookie header should contain the auth cookie
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(COOKIE_NAME);
    expect(setCookie).toContain('HttpOnly');
  });

  it('failure 401: returns 401 and does NOT set a cookie', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(401, { message: 'Unauthorized' }),
    );

    const req = makeRequest('POST', '/api/auth/login', {
      email: 'user@example.com',
      password: 'wrongpassword',
    });

    const res = await handler(req);
    expect(res.status).toBe(401);

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).not.toContain(COOKIE_NAME);
  });

  it('failure 403: maps to 401 response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(403, { message: 'Forbidden' }),
    );

    const req = makeRequest('POST', '/api/auth/login', {
      email: 'user@example.com',
      password: 'wrongpassword',
    });

    const res = await handler(req);
    expect(res.status).toBe(401);
  });

  it('invalid redirect next param: returns 400', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeFetchResponse(200, { accessToken: 'tok' }),
    );

    const req = makeRequest('POST', '/api/auth/login', {
      email: 'user@example.com',
      password: 'password123',
      next: '//evil.com',
    });

    const res = await handler(req);
    expect(res.status).toBe(400);
  });

  it('URL-encoded open redirect next=%2F%2Fevil.com: returns 400', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeFetchResponse(200, { accessToken: 'tok' }),
    );

    const req = makeRequest('POST', '/api/auth/login', {
      email: 'user@example.com',
      password: 'password123',
      next: '/%2F%2Fevil.com',
    });

    const res = await handler(req);
    expect(res.status).toBe(400);
  });

  it('missing email: returns 400', async () => {
    const req = makeRequest('POST', '/api/auth/login', {
      password: 'password123',
    });
    const res = await handler(req);
    expect(res.status).toBe(400);
  });

  it('backend 429: propagates rate-limit response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(429, { message: 'Too Many Requests' }),
    );

    const req = makeRequest('POST', '/api/auth/login', {
      email: 'user@example.com',
      password: 'password123',
    });

    const res = await handler(req);
    expect(res.status).toBe(429);
  });
});

// ─── Register route ──────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  let handler: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn());
    const mod = await import('@/app/api/auth/register/route');
    handler = mod.POST;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('success: sets httpOnly cookie after auto-login', async () => {
    const fetchMock = vi.mocked(fetch);
    // First call: register → 201
    fetchMock.mockResolvedValueOnce(
      makeFetchResponse(201, { id: 'uuid-1', email: 'user@example.com' }),
    );
    // Second call: auto-login → 200 with token
    fetchMock.mockResolvedValueOnce(
      makeFetchResponse(200, { accessToken: 'fresh-token' }),
    );

    const req = makeRequest('POST', '/api/auth/register', {
      email: 'user@example.com',
      password: 'password123',
      firstName: 'Joan',
      lastName: 'Costa',
    });

    const res = await handler(req);
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(true);
    // No requiresLogin when auto-login succeeds
    expect(body.requiresLogin).toBeUndefined();

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(COOKIE_NAME);
    expect(setCookie).toContain('HttpOnly');
  });

  it('duplicate email: returns 409', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(409, { message: 'email_already_registered' }),
    );

    const req = makeRequest('POST', '/api/auth/register', {
      email: 'existing@example.com',
      password: 'password123',
      firstName: 'Joan',
      lastName: 'Costa',
    });

    const res = await handler(req);
    expect(res.status).toBe(409);
  });

  it('auto-login fails after successful register: returns 200 with requiresLogin:true', async () => {
    const fetchMock = vi.mocked(fetch);
    // register succeeds
    fetchMock.mockResolvedValueOnce(
      makeFetchResponse(201, { id: 'uuid-2', email: 'user@example.com' }),
    );
    // auto-login fails
    fetchMock.mockResolvedValueOnce(
      makeFetchResponse(401, { message: 'Unauthorized' }),
    );

    const req = makeRequest('POST', '/api/auth/register', {
      email: 'user@example.com',
      password: 'password123',
      firstName: 'Joan',
      lastName: 'Costa',
    });

    const res = await handler(req);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(body.requiresLogin).toBe(true);
    // FIX 7: message must be present and unambiguous
    expect(typeof body.message).toBe('string');
    expect((body.message as string).length).toBeGreaterThan(0);
    // No accessToken must not be in the body
    expect(body).not.toHaveProperty('accessToken');

    // No auth cookie should be set
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).not.toContain(COOKIE_NAME);
  });

  it('short password (<8): returns 400 without calling backend', async () => {
    const req = makeRequest('POST', '/api/auth/register', {
      email: 'user@example.com',
      password: 'short',
      firstName: 'Joan',
      lastName: 'Costa',
    });

    const res = await handler(req);
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('long password (>72 chars): returns 400 without calling backend', async () => {
    const req = makeRequest('POST', '/api/auth/register', {
      email: 'user@example.com',
      password: 'a'.repeat(73),
      firstName: 'Joan',
      lastName: 'Costa',
    });

    const res = await handler(req);
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('invalid email: returns 400 without calling backend', async () => {
    const req = makeRequest('POST', '/api/auth/register', {
      email: 'not-an-email',
      password: 'password123',
      firstName: 'Joan',
      lastName: 'Costa',
    });

    const res = await handler(req);
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('backend 429: propagates rate-limit response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(429, { message: 'Too Many Requests' }),
    );

    const req = makeRequest('POST', '/api/auth/register', {
      email: 'user@example.com',
      password: 'password123',
      firstName: 'Joan',
      lastName: 'Costa',
    });

    const res = await handler(req);
    expect(res.status).toBe(429);
  });
});

// ─── Logout route ────────────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  let handler: () => Promise<Response>;

  beforeEach(async () => {
    const mod = await import('@/app/api/auth/logout/route');
    handler = mod.POST;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('clears the auth cookie with maxAge=0', async () => {
    const res = await handler();
    expect(res.status).toBe(200);

    const setCookie = res.headers.get('set-cookie') ?? '';
    // Cookie should be cleared (maxAge=0 or expires in the past)
    expect(setCookie).toContain(COOKIE_NAME);
    // Should set an empty value or Max-Age=0
    expect(setCookie).toMatch(/Max-Age=0|expires=Thu, 01 Jan 1970/i);
  });

  it('cookie cleared with HttpOnly and Path=/ options (same as COOKIE_OPTIONS)', async () => {
    const res = await handler();
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Path=/');
  });
});

// ─── Me route ────────────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  let handler: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn());
    const mod = await import('@/app/api/auth/me/route');
    handler = mod.GET;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('valid token: returns user data without accessToken or passwordHash', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(200, {
        id: 'uuid-1',
        email: 'user@example.com',
        firstName: 'Joan',
        lastName: 'Costa',
        passwordHash: '$2b$12$shouldnotbeleaked',
        accessToken: 'should-not-leak',
      }),
    );

    const req = makeRequest(
      'GET',
      '/api/auth/me',
      undefined,
      { [COOKIE_NAME]: 'valid-token' },
    );

    const res = await handler(req);
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body.id).toBe('uuid-1');
    expect(body.email).toBe('user@example.com');
    expect(body.firstName).toBe('Joan');
    expect(body.lastName).toBe('Costa');
    // Sensitive fields must NOT be present
    expect(body).not.toHaveProperty('accessToken');
    expect(body).not.toHaveProperty('passwordHash');
  });

  it('missing cookie: returns 401 without calling backend', async () => {
    const req = makeRequest('GET', '/api/auth/me');

    const res = await handler(req);
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('invalid/expired token: backend returns 401 → response is 401 and cookie is cleared', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(401, { message: 'Unauthorized' }),
    );

    const req = makeRequest(
      'GET',
      '/api/auth/me',
      undefined,
      { [COOKIE_NAME]: 'expired-token' },
    );

    const res = await handler(req);
    expect(res.status).toBe(401);

    // Stale cookie should be cleared
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(COOKIE_NAME);
    expect(setCookie).toMatch(/Max-Age=0|expires=Thu, 01 Jan 1970/i);
  });
});

// ─── isValidRedirect helper ──────────────────────────────────────────────────

describe('isValidRedirect', () => {
  it('accepts "/"', () => {
    expect(isValidRedirect('/')).toBe(true);
  });

  it('accepts "/account"', () => {
    expect(isValidRedirect('/account')).toBe(true);
  });

  it('accepts "/order/123"', () => {
    expect(isValidRedirect('/order/123')).toBe(true);
  });

  it('rejects "//evil.com" (open redirect via double-slash)', () => {
    expect(isValidRedirect('//evil.com')).toBe(false);
  });

  it('rejects "https://evil.com" (absolute URL)', () => {
    expect(isValidRedirect('https://evil.com')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidRedirect('')).toBe(false);
  });

  it('rejects null', () => {
    expect(isValidRedirect(null)).toBe(false);
  });

  it('rejects "javascript:alert(1)"', () => {
    expect(isValidRedirect('javascript:alert(1)')).toBe(false);
  });

  it('rejects "/%2F%2Fevil.com" (URL-encoded double-slash after decode)', () => {
    // After decodeURIComponent: "//evil.com" — must be blocked
    expect(isValidRedirect('/%2F%2Fevil.com')).toBe(false);
  });

  it('rejects "/\\\\evil" (backslash after slash)', () => {
    expect(isValidRedirect('/\\evil')).toBe(false);
  });
});

// ─── getCurrentUser ───────────────────────────────────────────────────────────

describe('getCurrentUser', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns null (does not throw) when fetch throws a network error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const { getCurrentUser, COOKIE_NAME: CN } = await import('@/lib/auth');

    // Build a minimal ReadonlyRequestCookies-like cookie store
    const cookieStore = {
      get: (name: string) => (name === CN ? { name, value: 'some-token' } : undefined),
    } as Parameters<typeof getCurrentUser>[0];

    const result = await getCurrentUser(cookieStore);
    expect(result).toBeNull();
  });

  it('returns null when there is no auth cookie', async () => {
    const { getCurrentUser } = await import('@/lib/auth');

    const cookieStore = {
      get: () => undefined,
    } as Parameters<typeof getCurrentUser>[0];

    const result = await getCurrentUser(cookieStore);
    expect(result).toBeNull();
    // fetch must not have been called at all
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns null when backend returns 401 (expired token)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(401, { message: 'Unauthorized' }),
    );

    const { getCurrentUser, COOKIE_NAME: CN } = await import('@/lib/auth');

    const cookieStore = {
      get: (name: string) => (name === CN ? { name, value: 'expired-token' } : undefined),
    } as Parameters<typeof getCurrentUser>[0];

    const result = await getCurrentUser(cookieStore);
    expect(result).toBeNull();
  });
});

// ─── Security: no localStorage/sessionStorage in auth files ──────────────────

describe('Security: no localStorage or sessionStorage used in auth-related source files', () => {
  it('auth.ts loads cleanly in jsdom without touching localStorage or sessionStorage', async () => {
    // Spy on localStorage and sessionStorage. If any auth helper touches them
    // during import or invocation, the spy will record the call.
    const localStorageSpy = vi.spyOn(window, 'localStorage', 'get');
    const sessionStorageSpy = vi.spyOn(window, 'sessionStorage', 'get');

    const mod = await import('@/lib/auth');

    // Exercise the public helpers — none should trigger storage access.
    expect(() => mod.isValidRedirect('/test')).not.toThrow();
    expect(() => mod.isValidRedirect(null)).not.toThrow();

    expect(localStorageSpy).not.toHaveBeenCalled();
    expect(sessionStorageSpy).not.toHaveBeenCalled();

    localStorageSpy.mockRestore();
    sessionStorageSpy.mockRestore();
  });

  it('COOKIE_NAME is a simple string (not an object key stored in localStorage)', () => {
    expect(typeof COOKIE_NAME).toBe('string');
    expect(COOKIE_NAME).not.toContain('localStorage');
    expect(COOKIE_NAME).not.toContain('sessionStorage');
  });
});
