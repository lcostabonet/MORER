import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl } from '@/lib/auth';
import { checkCsrf } from '@/lib/csrf';

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
    apiRes = await fetch(`${apiUrl}/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch {
    return NextResponse.json(
      { error: 'Error de servicio. Inténtalo de nuevo.' },
      { status: 503 },
    );
  }

  if (apiRes.ok) {
    return NextResponse.json({ success: true }, { status: 200 });
  }

  // Forward 4xx errors from the API.
  // IMPORTANT: NestJS wraps HttpExceptions as { message, error, statusCode }.
  // We read `message` (the user-facing text) and never `error` (the HTTP category
  // string such as "Unauthorized" or "Bad Request"), which must not reach the UI.
  if (apiRes.status >= 400 && apiRes.status < 500) {
    const INVALID_TOKEN_MSG =
      'El enlace de verificación no es válido o ha caducado.';
    let errorMessage = INVALID_TOKEN_MSG;
    try {
      const data = (await apiRes.json()) as { message?: unknown };
      if (typeof data.message === 'string' && data.message.length > 0) {
        errorMessage = data.message;
      }
    } catch {
      // JSON parse failed — keep the safe fallback
    }
    return NextResponse.json({ error: errorMessage }, { status: apiRes.status });
  }

  return NextResponse.json(
    { error: 'Error de servicio. Inténtalo de nuevo.' },
    { status: 503 },
  );
}
