import 'server-only';
import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';

export const COOKIE_NAME = 'morer_auth';

export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 7 days
};

function getApiUrl(): string {
  const url = process.env.API_URL;
  if (!url && process.env.NODE_ENV === 'production') {
    throw new Error('[apps/web] API_URL is required in production.');
  }
  return url ?? 'http://localhost:4000';
}

export { getApiUrl };

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export async function getCurrentUser(
  cookieStore: ReadonlyRequestCookies,
): Promise<AuthUser | null> {
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const apiUrl = getApiUrl();
    const res = await fetch(`${apiUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as AuthUser;
    return { id: data.id, email: data.email, firstName: data.firstName, lastName: data.lastName };
  } catch {
    return null;
  }
}

export function isValidRedirect(next: string | null): boolean {
  if (!next) return false;
  try {
    const decoded = decodeURIComponent(next);
    // After decoding, must start with exactly one "/" and NOT with "//" or "/\"
    // This blocks /%2Fevil.com and /\evil.com open-redirect variants.
    return (
      decoded.startsWith('/') &&
      !decoded.startsWith('//') &&
      !decoded.startsWith('/\\')
    );
  } catch {
    // Malformed percent-encoding — reject
    return false;
  }
}
