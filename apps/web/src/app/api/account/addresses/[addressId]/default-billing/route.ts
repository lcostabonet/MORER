import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl, COOKIE_NAME } from '@/lib/auth';
import { checkCsrf } from '@/lib/csrf';
import { GENERIC_ERROR, SESSION_EXPIRED, forwardApiError } from '@/lib/address-bff';

interface RouteContext {
  params: Promise<{ addressId: string }>;
}

export async function POST(
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
      `${getApiUrl()}/customers/me/addresses/${encodeURIComponent(addressId)}/default-billing`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      },
    );
  } catch {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 503 });
  }

  if (!apiRes.ok) return forwardApiError(apiRes);

  const data = (await apiRes.json()) as unknown;
  return NextResponse.json(data, { status: 200 });
}
