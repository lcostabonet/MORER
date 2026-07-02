import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl, COOKIE_NAME, clearAuthCookies } from '@/lib/auth';
import { checkCsrf } from '@/lib/csrf';
import type { AuthUser } from '@/lib/auth';

// The public profile shape forwarded to the browser — never the raw token or
// any sensitive/internal field.
function publicProfile(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: typeof user.phone === 'string' ? user.phone : null,
    emailVerified: user.emailVerified === true,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiUrl = getApiUrl();

  let res: Response;
  try {
    res = await fetch(`${apiUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'Service error' }, { status: 503 });
  }

  if (res.status === 401 || res.status === 403) {
    const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // Clear stale cookie
    clearAuthCookies(response);
    return response;
  }

  if (!res.ok) {
    return NextResponse.json({ error: 'Service error' }, { status: 503 });
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return NextResponse.json({ error: 'Service error' }, { status: 503 });
  }

  const user = data as AuthUser;
  // Return only what the client needs — never the raw token
  return NextResponse.json(publicProfile(user), { status: 200 });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  // CSRF/Origin protection for this state-mutating route.
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

  // Forward ONLY the editable fields — never proxy the raw body (which could
  // carry id/email/passwordHash). The API also whitelists, but we filter here too.
  const { firstName, lastName, phone } = body as Record<string, unknown>;
  const payload: Record<string, unknown> = { firstName, lastName };
  if (phone !== undefined) payload.phone = phone;

  const apiUrl = getApiUrl();

  let apiRes: Response;
  try {
    apiRes = await fetch(`${apiUrl}/auth/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return NextResponse.json(
      { error: 'No se ha podido actualizar el perfil. Inténtalo de nuevo.' },
      { status: 503 },
    );
  }

  if (apiRes.status === 401 || apiRes.status === 403) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (apiRes.ok) {
    let updated: unknown;
    try {
      updated = await apiRes.json();
    } catch {
      return NextResponse.json(
        { error: 'No se ha podido actualizar el perfil. Inténtalo de nuevo.' },
        { status: 503 },
      );
    }
    return NextResponse.json(publicProfile(updated as AuthUser), { status: 200 });
  }

  // 4xx validation errors: forward the API's user-facing `message` (a clean
  // string), never `error` (the NestJS HTTP category) or statusText.
  if (apiRes.status >= 400 && apiRes.status < 500) {
    let errorMessage =
      'No se ha podido actualizar el perfil. Inténtalo de nuevo.';
    try {
      const errData = (await apiRes.json()) as { message?: unknown };
      if (typeof errData.message === 'string' && errData.message.length > 0) {
        errorMessage = errData.message;
      }
    } catch {
      // Keep the safe fallback
    }
    return NextResponse.json({ error: errorMessage }, { status: apiRes.status });
  }

  return NextResponse.json(
    { error: 'No se ha podido actualizar el perfil. Inténtalo de nuevo.' },
    { status: 503 },
  );
}
