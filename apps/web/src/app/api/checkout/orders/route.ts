import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl, COOKIE_NAME } from '@/lib/auth';
import { checkCsrf } from '@/lib/csrf';
import {
  GENERIC_ERROR,
  SESSION_EXPIRED,
  forwardApiError,
  pickCheckoutPayload,
} from '@/lib/checkout-bff';

// Creates an order for the authenticated customer from their selected addresses.
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
    apiRes = await fetch(`${getApiUrl()}/checkout/customer/from-cart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      // Only whitelisted checkout fields — never proxy full address data / customerId.
      body: JSON.stringify(pickCheckoutPayload(body)),
    });
  } catch {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 503 });
  }

  if (!apiRes.ok) return forwardApiError(apiRes);

  const data = (await apiRes.json()) as unknown;
  return NextResponse.json(data, { status: 201 });
}
