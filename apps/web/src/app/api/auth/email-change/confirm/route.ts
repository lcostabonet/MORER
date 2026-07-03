import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl, clearAuthCookies } from '@/lib/auth';
import { checkCsrf } from '@/lib/csrf';

// The single generic message for every invalid confirmation case.
const GENERIC =
  'El enlace de cambio de correo no es válido, ha caducado o la dirección ya no está disponible.';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrfCheck = checkCsrf(request);
  if (csrfCheck) return csrfCheck;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { token } = body as Record<string, unknown>;
  if (typeof token !== 'string') {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
  }

  const apiUrl = getApiUrl();

  let apiRes: Response;
  try {
    apiRes = await fetch(`${apiUrl}/auth/email-change/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch {
    return NextResponse.json({ error: GENERIC }, { status: 503 });
  }

  if (apiRes.ok) {
    // All sessions were revoked server-side — drop the stale auth cookie.
    const response = NextResponse.json({ success: true }, { status: 200 });
    clearAuthCookies(response);
    return response;
  }

  if (apiRes.status >= 400 && apiRes.status < 500) {
    let message = GENERIC;
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

  return NextResponse.json({ error: GENERIC }, { status: 503 });
}
