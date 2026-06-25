import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl, COOKIE_NAME, clearAuthCookies } from '@/lib/auth';
import type { AuthUser } from '@/lib/auth';

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
  return NextResponse.json(
    {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    { status: 200 },
  );
}
