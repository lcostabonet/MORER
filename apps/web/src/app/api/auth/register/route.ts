import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl, COOKIE_NAME, COOKIE_OPTIONS } from '@/lib/auth';
import { checkCsrf } from '@/lib/csrf';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrfCheck = checkCsrf(request);
  if (csrfCheck) return csrfCheck;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { email, password, firstName, lastName } = body as Record<string, unknown>;

  // Validation
  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    typeof firstName !== 'string' ||
    typeof lastName !== 'string'
  ) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
  }

  const trimmedEmail = email.trim();
  const trimmedFirstName = firstName.trim();
  const trimmedLastName = lastName.trim();

  if (!EMAIL_REGEX.test(trimmedEmail) || trimmedEmail.length > 254) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
  }
  if (password.length < 8 || password.length > 72) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
  }
  if (!trimmedFirstName || !trimmedLastName) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
  }

  const apiUrl = getApiUrl();

  // Register
  let registerRes: Response;
  try {
    registerRes = await fetch(`${apiUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: trimmedEmail,
        password,
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
      }),
    });
  } catch {
    return NextResponse.json({ error: 'Service error' }, { status: 503 });
  }

  if (registerRes.status === 409) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  }
  if (registerRes.status === 400) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
  }
  if (registerRes.status === 429) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  if (!registerRes.ok) {
    return NextResponse.json({ error: 'Service error' }, { status: 503 });
  }

  // Auto-login after successful register
  let loginRes: Response;
  try {
    loginRes = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: trimmedEmail, password }),
    });
  } catch {
    // Account was created but auto-login failed — unambiguous success + manual-login signal
    return NextResponse.json(
      { success: true, requiresLogin: true, message: 'Cuenta creada. Inicia sesión para continuar.' },
      { status: 200 },
    );
  }

  if (!loginRes.ok) {
    return NextResponse.json(
      { success: true, requiresLogin: true, message: 'Cuenta creada. Inicia sesión para continuar.' },
      { status: 200 },
    );
  }

  let loginData: unknown;
  try {
    loginData = await loginRes.json();
  } catch {
    return NextResponse.json(
      { success: true, requiresLogin: true, message: 'Cuenta creada. Inicia sesión para continuar.' },
      { status: 200 },
    );
  }

  const accessToken = (loginData as Record<string, unknown>).accessToken;
  if (typeof accessToken !== 'string') {
    return NextResponse.json(
      { success: true, requiresLogin: true, message: 'Cuenta creada. Inicia sesión para continuar.' },
      { status: 200 },
    );
  }

  const response = NextResponse.json({ success: true }, { status: 200 });
  response.cookies.set(COOKIE_NAME, accessToken, COOKIE_OPTIONS);
  return response;
}
