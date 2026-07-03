import 'server-only';
import { NextResponse } from 'next/server';
import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';

const isProd = process.env.NODE_ENV === 'production';

// Production uses the __Host- prefix: requires Secure=true, Path=/, no Domain.
// Development uses the plain name to allow HTTP on localhost.
export const COOKIE_NAME = isProd ? '__Host-morer_auth' : 'morer_auth';

// Legacy name kept only to clear old cookies during logout/401 in production.
const LEGACY_COOKIE_NAME = 'morer_auth';

export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProd, // must be true for __Host- prefix in production
  path: '/' as const,
  maxAge: 60 * 60 * 24 * 7,
  // No domain attribute — required for __Host- and more restrictive in general.
};

// Clears both the current and any legacy cookie name.
export function clearAuthCookies(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, '', { ...COOKIE_OPTIONS, maxAge: 0 });
  if (COOKIE_NAME !== LEGACY_COOKIE_NAME) {
    // Clear legacy morer_auth; does not need Secure since it was set without it.
    response.cookies.set(LEGACY_COOKIE_NAME, '', {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: false,
      path: '/',
      maxAge: 0,
    });
  }
}

function getApiUrl(): string {
  const url = process.env.API_URL;
  if (!url && isProd) {
    throw new Error('[apps/web] API_URL is required in production.');
  }
  return url ?? 'http://localhost:4000';
}
export { getApiUrl };

export function getWebOrigin(): string {
  const origin = process.env.WEB_ORIGIN;
  if (!origin) {
    if (isProd) throw new Error('[apps/web] WEB_ORIGIN is required in production.');
    return 'http://localhost:3000';
  }
  return origin;
}

export interface PendingEmailChange {
  newEmail: string;
  expiresAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  emailVerified: boolean;
  pendingEmailChange: PendingEmailChange | null;
}

// Defensively coerce the pendingEmailChange field from an untrusted API body
// into a clean { newEmail, expiresAt } | null shape.
export function normalizePendingEmailChange(
  value: unknown,
): PendingEmailChange | null {
  if (value === null || typeof value !== 'object') return null;
  const v = value as { newEmail?: unknown; expiresAt?: unknown };
  if (typeof v.newEmail !== 'string' || typeof v.expiresAt !== 'string') {
    return null;
  }
  return { newEmail: v.newEmail, expiresAt: v.expiresAt };
}

export async function getCurrentUser(
  cookieStore: ReadonlyRequestCookies,
): Promise<AuthUser | null> {
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const apiUrl = getApiUrl();
    const res = await fetch(apiUrl + '/auth/me', {
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<AuthUser>;
    return {
      id: data.id ?? '',
      email: data.email ?? '',
      firstName: data.firstName ?? '',
      lastName: data.lastName ?? '',
      phone: typeof data.phone === 'string' ? data.phone : null,
      emailVerified: data.emailVerified === true,
      pendingEmailChange: normalizePendingEmailChange(data.pendingEmailChange),
    };
  } catch {
    return null;
  }
}

export function isValidRedirect(next: string | null): boolean {
  if (!next) return false;
  try {
    const decoded = decodeURIComponent(next);
    return decoded.startsWith('/') && !decoded.startsWith('//') && !decoded.startsWith('/\\');
  } catch {
    return false;
  }
}
