import 'server-only';
import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';
import { COOKIE_NAME, getApiUrl } from './auth';
import type { CustomerAddress } from './address-types';

// Server-side fetch of the authenticated customer's addresses. Returns an empty
// list on any failure (no session, API down, non-ok) so /account still renders.
export async function getAddresses(
  cookieStore: ReadonlyRequestCookies,
): Promise<CustomerAddress[]> {
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return [];
  try {
    const res = await fetch(`${getApiUrl()}/customers/me/addresses`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as CustomerAddress[]) : [];
  } catch {
    return [];
  }
}
