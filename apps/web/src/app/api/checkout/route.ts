import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl, COOKIE_NAME } from '@/lib/auth';
import { GENERIC_ERROR, SESSION_EXPIRED, forwardApiError } from '@/lib/checkout-bff';

// Returns the authenticated customer's checkout address state (read-only).
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: SESSION_EXPIRED }, { status: 401 });
  }

  let apiRes: Response;
  try {
    apiRes = await fetch(`${getApiUrl()}/checkout/customer`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 503 });
  }

  if (!apiRes.ok) return forwardApiError(apiRes);

  const data = (await apiRes.json()) as unknown;
  return NextResponse.json(data, { status: 200 });
}
