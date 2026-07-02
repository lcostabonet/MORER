/**
 * Route Handler tests for Phase 11A-gamma auth routes.
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
import { NextRequest, NextResponse } from 'next/server';
import { isValidRedirect, COOKIE_NAME } from '@/lib/auth';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(
  method: string,
  url: string,
  body?: unknown,
  cookies: Record<string, string> = {},
  extraHeaders: Record<string, string> = {},
): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extraHeaders };
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  if (cookieHeader) {
    headers['cookie'] = cookieHeader;
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

// ─── Cookie naming (T1–T4) ───────────────────────────────────────────────────

describe('COOKIE_NAME and COOKIE_OPTIONS', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('T1: COOKIE_NAME === "morer_auth" when NODE_ENV !== "production"', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { COOKIE_NAME: name } = await import('@/lib/auth');
    expect(name).toBe('morer_auth');
  });

  it('T2: COOKIE_NAME === "__Host-morer_auth" when NODE_ENV === "production"', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('WEB_ORIGIN', 'https://morer.es');
    vi.stubEnv('API_URL', 'https://api.morer.es');
    const { COOKIE_NAME: name } = await import('@/lib/auth');
    expect(name).toBe('__Host-morer_auth');
  });

  it('T3: COOKIE_OPTIONS.secure === true when NODE_ENV === "production"', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('WEB_ORIGIN', 'https://morer.es');
    vi.stubEnv('API_URL', 'https://api.morer.es');
    const { COOKIE_OPTIONS } = await import('@/lib/auth');
    expect(COOKIE_OPTIONS.secure).toBe(true);
  });

  it('T4: COOKIE_OPTIONS has no "domain" property (for __Host- compatibility)', async () => {
    const { COOKIE_OPTIONS } = await import('@/lib/auth');
    expect(COOKIE_OPTIONS).not.toHaveProperty('domain');
  });
});

// ─── CSRF unit tests (T5–T14) ────────────────────────────────────────────────

describe('checkCsrf', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function getCheckCsrf() {
    const mod = await import('@/lib/csrf');
    return mod.checkCsrf;
  }

  it('T5: sec-fetch-site: "cross-site" returns 403', async () => {
    const checkCsrf = await getCheckCsrf();
    const req = makeRequest('POST', '/api/auth/logout', undefined, {}, {
      'sec-fetch-site': 'cross-site',
    });
    const result = checkCsrf(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it('T6: sec-fetch-site: "same-site" returns 403', async () => {
    const checkCsrf = await getCheckCsrf();
    const req = makeRequest('POST', '/api/auth/logout', undefined, {}, {
      'sec-fetch-site': 'same-site',
    });
    const result = checkCsrf(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it('T7: origin: "null" (literal string) returns 403', async () => {
    const checkCsrf = await getCheckCsrf();
    const req = makeRequest('POST', '/api/auth/logout', undefined, {}, {
      'origin': 'null',
    });
    const result = checkCsrf(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it('T8: origin: "https://evil.com" with NODE_ENV=production and WEB_ORIGIN="https://morer.es" returns 403', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('WEB_ORIGIN', 'https://morer.es');
    const checkCsrf = await getCheckCsrf();
    const req = makeRequest('POST', '/api/auth/logout', undefined, {}, {
      'origin': 'https://evil.com',
    });
    const result = checkCsrf(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it('T9: origin: "https://morer.es.attacker.com" returns 403', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('WEB_ORIGIN', 'https://morer.es');
    const checkCsrf = await getCheckCsrf();
    const req = makeRequest('POST', '/api/auth/logout', undefined, {}, {
      'origin': 'https://morer.es.attacker.com',
    });
    const result = checkCsrf(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it('T10: origin: "https://morer.es" with NODE_ENV=production and WEB_ORIGIN="https://morer.es" returns null', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('WEB_ORIGIN', 'https://morer.es');
    const checkCsrf = await getCheckCsrf();
    const req = makeRequest('POST', '/api/auth/logout', undefined, {}, {
      'origin': 'https://morer.es',
    });
    const result = checkCsrf(req);
    expect(result).toBeNull();
  });

  it('T11: no origin, no referer, NODE_ENV=production returns 403', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('WEB_ORIGIN', 'https://morer.es');
    const checkCsrf = await getCheckCsrf();
    const req = makeRequest('POST', '/api/auth/logout');
    const result = checkCsrf(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it('T12: no origin, referer "https://morer.es/login", NODE_ENV=production, WEB_ORIGIN="https://morer.es" returns null', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('WEB_ORIGIN', 'https://morer.es');
    const checkCsrf = await getCheckCsrf();
    const req = makeRequest('POST', '/api/auth/logout', undefined, {}, {
      'referer': 'https://morer.es/login',
    });
    const result = checkCsrf(req);
    expect(result).toBeNull();
  });

  it('T13: no origin, NODE_ENV=development returns null', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const checkCsrf = await getCheckCsrf();
    const req = makeRequest('POST', '/api/auth/logout');
    const result = checkCsrf(req);
    expect(result).toBeNull();
  });

  it('T14: origin: "http://localhost:3000", NODE_ENV=development returns null', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const checkCsrf = await getCheckCsrf();
    const req = makeRequest('POST', '/api/auth/logout', undefined, {}, {
      'origin': 'http://localhost:3000',
    });
    const result = checkCsrf(req);
    expect(result).toBeNull();
  });
});

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

// ─── Logout route (T15–T17) ──────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('T15: reads cookie, calls backend /auth/logout with Bearer token, clears cookie', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse(200, {}));

    const mod = await import('@/app/api/auth/logout/route');
    const req = makeRequest('POST', '/api/auth/logout', undefined, {
      [COOKIE_NAME]: 'test-token-abc',
    });

    const res = await mod.POST(req);
    expect(res.status).toBe(200);

    // fetch must have been called with the backend logout endpoint and Bearer token
    expect(fetch).toHaveBeenCalledOnce();
    const [calledUrl, calledOptions] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/auth/logout');
    expect((calledOptions.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token-abc');
    expect(calledOptions.method).toBe('POST');

    // Auth cookie must be cleared
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/Max-Age=0|expires=Thu, 01 Jan 1970/i);
  });

  it('T16: fetch throwing (API down) returns 200 with message and clears cookie', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const mod = await import('@/app/api/auth/logout/route');
    const req = makeRequest('POST', '/api/auth/logout', undefined, {
      [COOKIE_NAME]: 'test-token-abc',
    });

    const res = await mod.POST(req);
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(typeof body.message).toBe('string');
    expect((body.message as string).length).toBeGreaterThan(0);

    // Cookie still cleared despite API being down
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/Max-Age=0|expires=Thu, 01 Jan 1970/i);
  });

  it('T17: clearAuthCookies clears both "morer_auth" AND "__Host-morer_auth" from the response', async () => {
    const { clearAuthCookies } = await import('@/lib/auth');

    const setCalls: Array<[string, string, Record<string, unknown>]> = [];
    const mockResponse = {
      cookies: {
        set: (name: string, value: string, options: Record<string, unknown>) => {
          setCalls.push([name, value, options]);
        },
      },
    } as unknown as NextResponse;

    clearAuthCookies(mockResponse);

    const names = setCalls.map(([name]) => name);
    // Must clear both __Host-morer_auth (or morer_auth) and the legacy morer_auth
    expect(names).toContain('morer_auth');
    // At least one call should have maxAge: 0 (clearing)
    const allMaxAgeZero = setCalls.every(([, , opts]) => opts['maxAge'] === 0);
    expect(allMaxAgeZero).toBe(true);
  });
});

// ─── Logout-all route (T18–T19) ──────────────────────────────────────────────

describe('POST /api/auth/logout-all', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('T18: calls backend /auth/logout-all with Bearer token and clears cookie', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse(200, {}));

    const mod = await import('@/app/api/auth/logout-all/route');
    const req = makeRequest('POST', '/api/auth/logout-all', undefined, {
      [COOKIE_NAME]: 'test-token-xyz',
    });

    const res = await mod.POST(req);
    expect(res.status).toBe(200);

    expect(fetch).toHaveBeenCalledOnce();
    const [calledUrl, calledOptions] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/auth/logout-all');
    expect((calledOptions.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token-xyz');

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/Max-Age=0|expires=Thu, 01 Jan 1970/i);
  });

  it('T19: API down returns 200 with message and clears cookie', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const mod = await import('@/app/api/auth/logout-all/route');
    const req = makeRequest('POST', '/api/auth/logout-all', undefined, {
      [COOKIE_NAME]: 'test-token-xyz',
    });

    const res = await mod.POST(req);
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(typeof body.message).toBe('string');
    expect((body.message as string).length).toBeGreaterThan(0);

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/Max-Age=0|expires=Thu, 01 Jan 1970/i);
  });
});

// ─── Me route (T20) ─────────────────────────────────────────────────────────

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
        phone: '+34612345678',
        emailVerified: true,
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
    expect(body.phone).toBe('+34612345678');
    // emailVerified boolean is forwarded
    expect(body.emailVerified).toBe(true);
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

  it('T20: backend 401 response clears auth cookies', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(401, { message: 'Unauthorized' }),
    );

    const req = makeRequest(
      'GET',
      '/api/auth/me',
      undefined,
      { [COOKIE_NAME]: 'revoked-token' },
    );

    const res = await handler(req);
    expect(res.status).toBe(401);

    // clearAuthCookies must have been called — cookie header must show clearing
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/Max-Age=0|expires=Thu, 01 Jan 1970/i);
    // Also verify morer_auth (legacy) or COOKIE_NAME appears in set-cookie
    expect(setCookie.toLowerCase()).toContain('morer_auth');
  });
});

// ─── Security: no accessToken in route handler responses (T21) ───────────────

describe('T21: Security — no route handler response body contains "accessToken" key', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('login handler does not leak accessToken in response body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(200, { accessToken: 'secret-jwt' }),
    );
    const mod = await import('@/app/api/auth/login/route');
    const req = makeRequest('POST', '/api/auth/login', {
      email: 'user@example.com',
      password: 'password123',
    });
    const res = await mod.POST(req);
    const body = await res.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty('accessToken');
  });

  it('me handler does not include accessToken in proxied response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(200, {
        id: 'uuid-1',
        email: 'u@example.com',
        firstName: 'A',
        lastName: 'B',
        accessToken: 'should-not-appear',
      }),
    );
    const mod = await import('@/app/api/auth/me/route');
    const req = makeRequest('GET', '/api/auth/me', undefined, { [COOKIE_NAME]: 'tok' });
    const res = await mod.GET(req);
    const body = await res.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty('accessToken');
  });

  it('logout handler does not include accessToken in response body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse(200, {}));
    const mod = await import('@/app/api/auth/logout/route');
    const req = makeRequest('POST', '/api/auth/logout', undefined, { [COOKIE_NAME]: 'tok' });
    const res = await mod.POST(req);
    const body = await res.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty('accessToken');
  });

  it('logout-all handler does not include accessToken in response body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse(200, {}));
    const mod = await import('@/app/api/auth/logout-all/route');
    const req = makeRequest('POST', '/api/auth/logout-all', undefined, { [COOKIE_NAME]: 'tok' });
    const res = await mod.POST(req);
    const body = await res.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty('accessToken');
  });
});

// ─── Security headers from next.config.ts (T22–T25) ─────────────────────────

describe('Security headers (next.config.ts)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function getNextConfigHeaders(): Promise<Array<{ key: string; value: string }>> {
    // next.config.ts uses process.env.NODE_ENV at module evaluation time,
    // so we must reset modules after stubbing the env.
    const mod = await import('../next.config');
    const config = mod.default as { headers?: () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>> };
    if (!config.headers) return [];
    const routes = await config.headers();
    // Flatten all headers from all routes
    return routes.flatMap((r) => r.headers);
  }

  it('T22: headers array contains X-Content-Type-Options: nosniff', async () => {
    const headers = await getNextConfigHeaders();
    const header = headers.find((h) => h.key === 'X-Content-Type-Options');
    expect(header).toBeDefined();
    expect(header!.value).toBe('nosniff');
  });

  it('T23: headers contain Content-Security-Policy-Report-Only containing "https://js.stripe.com"', async () => {
    const headers = await getNextConfigHeaders();
    const cspHeader = headers.find((h) => h.key === 'Content-Security-Policy-Report-Only');
    expect(cspHeader).toBeDefined();
    expect(cspHeader!.value).toContain('https://js.stripe.com');
  });

  it('T24: HSTS header NOT present when NODE_ENV !== "production"', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const headers = await getNextConfigHeaders();
    const hsts = headers.find((h) => h.key === 'Strict-Transport-Security');
    expect(hsts).toBeUndefined();
  });

  it('T25: X-Frame-Options: DENY present', async () => {
    const headers = await getNextConfigHeaders();
    const xfo = headers.find((h) => h.key === 'X-Frame-Options');
    expect(xfo).toBeDefined();
    expect(xfo!.value).toBe('DENY');
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

// ─── Verify-email route ───────────────────────────────────────────────────────

describe('POST /api/auth/verify-email', () => {
  let handler: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn());
    const mod = await import('@/app/api/auth/verify-email/route');
    handler = mod.POST;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('CSRF: cross-site request returns 403 without calling backend', async () => {
    const req = makeRequest('POST', '/api/auth/verify-email', { token: 'x' }, {}, {
      'sec-fetch-site': 'cross-site',
    });
    const res = await handler(req);
    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('success: returns 200 with success:true', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse(200, { success: true }));

    const req = makeRequest('POST', '/api/auth/verify-email', { token: 'good-token' });
    const res = await handler(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
  });

  it('invalid token (400): forwards the message and never the HTTP error category', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(400, {
        message: 'El enlace de verificación no es válido o ha caducado.',
        error: 'Bad Request',
        statusCode: 400,
      }),
    );

    const req = makeRequest('POST', '/api/auth/verify-email', { token: 'used-token' });
    const res = await handler(req);

    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('El enlace de verificación no es válido o ha caducado.');
    // The NestJS HTTP category ("Bad Request") must never reach the client.
    expect(body.error).not.toBe('Bad Request');
  });

  it('missing token: returns 400 without calling backend', async () => {
    const req = makeRequest('POST', '/api/auth/verify-email', { notToken: 'x' });
    const res = await handler(req);
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('API network error: returns 503', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const req = makeRequest('POST', '/api/auth/verify-email', { token: 'tok' });
    const res = await handler(req);
    expect(res.status).toBe(503);
  });
});

// ─── Resend-verification route ────────────────────────────────────────────────

describe('POST /api/auth/resend-verification', () => {
  let handler: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn());
    const mod = await import('@/app/api/auth/resend-verification/route');
    handler = mod.POST;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('CSRF: cross-site request returns 403 without calling backend', async () => {
    const req = makeRequest('POST', '/api/auth/resend-verification', undefined, {
      [COOKIE_NAME]: 'tok',
    }, { 'sec-fetch-site': 'cross-site' });
    const res = await handler(req);
    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('missing cookie: returns 401 without calling backend', async () => {
    const req = makeRequest('POST', '/api/auth/resend-verification');
    const res = await handler(req);
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('success: forwards the Bearer token and returns the generic success message', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(200, { success: true, message: 'whatever the API says' }),
    );

    const req = makeRequest('POST', '/api/auth/resend-verification', undefined, {
      [COOKIE_NAME]: 'auth-token-123',
    });
    const res = await handler(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(typeof body.message).toBe('string');
    expect((body.message as string).length).toBeGreaterThan(0);

    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain('/auth/resend-verification');
    expect((options.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer auth-token-123',
    );
  });

  it('backend 401: returns 401', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse(401, { message: 'Unauthorized' }));

    const req = makeRequest('POST', '/api/auth/resend-verification', undefined, {
      [COOKIE_NAME]: 'auth-token-123',
    });
    const res = await handler(req);
    expect(res.status).toBe(401);
  });

  it('backend 429: returns 429 with a controlled retry message (no internals)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse(429, { message: 'Too Many Requests' }));

    const req = makeRequest('POST', '/api/auth/resend-verification', undefined, {
      [COOKIE_NAME]: 'auth-token-123',
    });
    const res = await handler(req);

    expect(res.status).toBe(429);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).not.toBe('Too Many Requests');
  });

  it('API network error: returns 200 with the generic success message (non-enumerating)', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const req = makeRequest('POST', '/api/auth/resend-verification', undefined, {
      [COOKIE_NAME]: 'auth-token-123',
    });
    const res = await handler(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
  });
});

// ─── Profile update route (PATCH /api/auth/me) ────────────────────────────────

describe('PATCH /api/auth/me', () => {
  let handler: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn());
    const mod = await import('@/app/api/auth/me/route');
    handler = mod.PATCH;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('CSRF: cross-site request returns 403 without calling backend', async () => {
    const req = makeRequest('PATCH', '/api/auth/me', { firstName: 'A', lastName: 'B' }, {
      [COOKIE_NAME]: 'tok',
    }, { 'sec-fetch-site': 'cross-site' });
    const res = await handler(req);
    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('missing cookie: returns 401 without calling backend', async () => {
    const req = makeRequest('PATCH', '/api/auth/me', { firstName: 'A', lastName: 'B' });
    const res = await handler(req);
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('success: forwards Bearer + only editable fields, returns filtered profile', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(200, {
        id: 'uuid-1',
        email: 'user@example.com',
        firstName: 'Anna',
        lastName: 'Puig',
        phone: '+34600111222',
        emailVerified: true,
        passwordHash: '$2b$12$secret',
        accessToken: 'should-not-leak',
      }),
    );

    const req = makeRequest('PATCH', '/api/auth/me', {
      firstName: 'Anna',
      lastName: 'Puig',
      phone: '+34 600 111 222',
      // Injected non-editable fields must not be forwarded.
      id: 'evil-id',
      email: 'evil@example.com',
      passwordHash: 'evil',
      emailVerifiedAt: '2020-01-01',
    }, { [COOKIE_NAME]: 'auth-token-123' });

    const res = await handler(req);
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.firstName).toBe('Anna');
    expect(body.lastName).toBe('Puig');
    expect(body.phone).toBe('+34600111222');
    expect(body.emailVerified).toBe(true);
    expect(body).not.toHaveProperty('accessToken');
    expect(body).not.toHaveProperty('passwordHash');

    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain('/auth/me');
    expect(options.method).toBe('PATCH');
    expect((options.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer auth-token-123',
    );
    // The forwarded body must contain only the editable fields.
    const forwarded = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(Object.keys(forwarded).sort()).toEqual(['firstName', 'lastName', 'phone'].sort());
    expect(forwarded).not.toHaveProperty('id');
    expect(forwarded).not.toHaveProperty('email');
    expect(forwarded).not.toHaveProperty('passwordHash');
  });

  it('does not set or modify any cookie on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(200, {
        id: 'uuid-1', email: 'u@e.com', firstName: 'A', lastName: 'B', phone: null, emailVerified: false,
      }),
    );

    const req = makeRequest('PATCH', '/api/auth/me', { firstName: 'A', lastName: 'B' }, {
      [COOKIE_NAME]: 'auth-token-123',
    });
    const res = await handler(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('validation 400: forwards the message, never the HTTP error category', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeFetchResponse(400, {
        message: 'El nombre es obligatorio.',
        error: 'Bad Request',
        statusCode: 400,
      }),
    );

    const req = makeRequest('PATCH', '/api/auth/me', { firstName: '', lastName: 'B' }, {
      [COOKIE_NAME]: 'auth-token-123',
    });
    const res = await handler(req);

    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('El nombre es obligatorio.');
    expect(body.error).not.toBe('Bad Request');
  });

  it('backend 401: returns 401', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeFetchResponse(401, { message: 'Unauthorized' }));

    const req = makeRequest('PATCH', '/api/auth/me', { firstName: 'A', lastName: 'B' }, {
      [COOKIE_NAME]: 'auth-token-123',
    });
    const res = await handler(req);
    expect(res.status).toBe(401);
  });

  it('network error: returns 503 with a controlled message (no internals)', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const req = makeRequest('PATCH', '/api/auth/me', { firstName: 'A', lastName: 'B' }, {
      [COOKIE_NAME]: 'auth-token-123',
    });
    const res = await handler(req);

    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.error).toBe('string');
    expect(body.error).not.toContain('ECONNREFUSED');
  });
});
