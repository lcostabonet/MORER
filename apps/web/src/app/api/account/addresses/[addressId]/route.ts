import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl, COOKIE_NAME } from '@/lib/auth';
import { checkCsrf } from '@/lib/csrf';
import {
  GENERIC_ERROR,
  SESSION_EXPIRED,
  forwardApiError,
  pickAddressPayload,
} from '@/lib/address-bff';

interface RouteContext {
  params: Promise<{ addressId: string }>;
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const csrfCheck = checkCsrf(request);
  if (csrfCheck) return csrfCheck;

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: SESSION_EXPIRED }, { status: 401 });
  }

  const { addressId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  let apiRes: Response;
  try {
    apiRes = await fetch(
      `${getApiUrl()}/customers/me/addresses/${encodeURIComponent(addressId)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(pickAddressPayload(body)),
      },
    );
  } catch {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 503 });
  }

  if (!apiRes.ok) return forwardApiError(apiRes);

  const data = (await apiRes.json()) as unknown;
  return NextResponse.json(data, { status: 200 });
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const csrfCheck = checkCsrf(request);
  if (csrfCheck) return csrfCheck;

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: SESSION_EXPIRED }, { status: 401 });
  }

  const { addressId } = await context.params;

  let apiRes: Response;
  try {
    apiRes = await fetch(
      `${getApiUrl()}/customers/me/addresses/${encodeURIComponent(addressId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      },
    );
  } catch {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 503 });
  }

  if (!apiRes.ok) return forwardApiError(apiRes);

  return NextResponse.json({ success: true }, { status: 200 });
}
