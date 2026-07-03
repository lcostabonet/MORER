import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl, COOKIE_NAME } from '@/lib/auth';
import { checkCsrf } from '@/lib/csrf';

const GENERIC_ERROR = 'No se ha podido procesar la solicitud. Inténtalo de nuevo.';
const SUCCESS_MSG = 'Hemos enviado un enlace de confirmación a tu nueva dirección.';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrfCheck = checkCsrf(request);
  if (csrfCheck) return csrfCheck;

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { newEmail, currentPassword } = body as Record<string, unknown>;
  if (typeof newEmail !== 'string' || typeof currentPassword !== 'string') {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
  }

  const apiUrl = getApiUrl();

  let apiRes: Response;
  try {
    apiRes = await fetch(`${apiUrl}/auth/email-change/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      // Forward only the two editable fields — never proxy the raw body.
      body: JSON.stringify({ newEmail, currentPassword }),
    });
  } catch {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 503 });
  }

  if (apiRes.status === 401 || apiRes.status === 403) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (apiRes.ok) {
    let message = SUCCESS_MSG;
    try {
      const data = (await apiRes.json()) as { message?: unknown };
      if (typeof data.message === 'string' && data.message.length > 0) {
        message = data.message;
      }
    } catch {
      // Keep default success message
    }
    return NextResponse.json({ success: true, message }, { status: 200 });
  }

  // Forward the API's user-facing `message` (never `error`/statusText) for 4xx.
  if (apiRes.status >= 400 && apiRes.status < 500) {
    let message = GENERIC_ERROR;
    try {
      const data = (await apiRes.json()) as { message?: unknown };
      if (typeof data.message === 'string' && data.message.length > 0) {
        message = data.message;
      }
    } catch {
      // Keep generic message
    }
    return NextResponse.json({ error: message }, { status: apiRes.status });
  }

  return NextResponse.json({ error: GENERIC_ERROR }, { status: 503 });
}
