import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl, COOKIE_NAME } from '@/lib/auth';
import { checkCsrf } from '@/lib/csrf';
import {
  GENERIC_ERROR,
  SESSION_EXPIRED,
  forwardApiError,
  pickAddressPayload,
} from '@/lib/address-bff';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: SESSION_EXPIRED }, { status: 401 });
  }

  let apiRes: Response;
  try {
    apiRes = await fetch(`${getApiUrl()}/customers/me/addresses`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 503 });
  }

  if (!apiRes.ok) return forwardApiError(apiRes);

  const data = (await apiRes.json()) as unknown;
  return NextResponse.json(Array.isArray(data) ? data : [], { status: 200 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrfCheck = checkCsrf(request);
  if (csrfCheck) return csrfCheck;

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: SESSION_EXPIRED }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  let apiRes: Response;
  try {
    apiRes = await fetch(`${getApiUrl()}/customers/me/addresses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      // Only whitelisted address fields — never proxy the raw body.
      body: JSON.stringify(pickAddressPayload(body)),
    });
  } catch {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 503 });
  }

  if (!apiRes.ok) return forwardApiError(apiRes);

  const data = (await apiRes.json()) as unknown;
  return NextResponse.json(data, { status: 201 });
}
