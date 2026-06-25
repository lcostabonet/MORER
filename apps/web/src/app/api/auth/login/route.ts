import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl, COOKIE_NAME, COOKIE_OPTIONS, isValidRedirect } from '@/lib/auth';
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

  const { email, password, next } = body as Record<string, unknown>;

  if (typeof email !== 'string' || typeof password !== 'string') {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
  }

  // Validate redirect path if provided
  const redirectTo = typeof next === 'string' ? next : null;
  if (redirectTo !== null && !isValidRedirect(redirectTo)) {
    return NextResponse.json({ error: 'Invalid redirect' }, { status: 400 });
  }

  const apiUrl = getApiUrl();

  let loginRes: Response;
  try {
    loginRes = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    });
  } catch {
    return NextResponse.json({ error: 'Service error' }, { status: 503 });
  }

  if (loginRes.status === 401 || loginRes.status === 403) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  if (loginRes.status === 429) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  if (!loginRes.ok) {
    return NextResponse.json({ error: 'Service error' }, { status: 503 });
  }

  let loginData: unknown;
  try {
    loginData = await loginRes.json();
  } catch {
    return NextResponse.json({ error: 'Service error' }, { status: 503 });
  }

  const accessToken = (loginData as Record<string, unknown>).accessToken;
  if (typeof accessToken !== 'string') {
    return NextResponse.json({ error: 'Service error' }, { status: 503 });
  }

  const response = NextResponse.json({ success: true }, { status: 200 });
  // accessToken stays server-side only — never in response body
  response.cookies.set(COOKIE_NAME, accessToken, COOKIE_OPTIONS);
  return response;
}
