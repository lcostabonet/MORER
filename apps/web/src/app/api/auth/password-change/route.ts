import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl, COOKIE_NAME, clearAuthCookies } from '@/lib/auth';
import { checkCsrf } from '@/lib/csrf';

const GENERIC_ERROR = 'No se ha podido actualizar la contraseña. Inténtalo de nuevo.';
const SESSION_EXPIRED = 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
const SUCCESS_MSG = 'Contraseña actualizada correctamente. Vuelve a iniciar sesión.';

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

  const { currentPassword, newPassword } = body as Record<string, unknown>;
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
  }

  const apiUrl = getApiUrl();

  let apiRes: Response;
  try {
    apiRes = await fetch(`${apiUrl}/auth/password-change`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      // Forward ONLY the two password fields — never proxy the raw body.
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  } catch {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 503 });
  }

  if (apiRes.status === 401 || apiRes.status === 403) {
    return NextResponse.json({ error: SESSION_EXPIRED }, { status: 401 });
  }

  if (apiRes.status === 429) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Inténtalo de nuevo más tarde.' },
      { status: 429 },
    );
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
    // All sessions were revoked server-side — drop the stale auth cookie.
    const response = NextResponse.json({ success: true, message }, { status: 200 });
    clearAuthCookies(response);
    return response;
  }

  // 4xx: forward the API's user-facing `message`, never `error`/statusText.
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
