import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl, COOKIE_NAME } from '@/lib/auth';
import { checkCsrf } from '@/lib/csrf';

// Cancel the authenticated customer's pending email change. Idempotent.
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const csrfCheck = checkCsrf(request);
  if (csrfCheck) return csrfCheck;

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiUrl = getApiUrl();

  let apiRes: Response;
  try {
    apiRes = await fetch(`${apiUrl}/auth/email-change`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return NextResponse.json(
      { error: 'No se ha podido cancelar. Inténtalo de nuevo.' },
      { status: 503 },
    );
  }

  if (apiRes.status === 401 || apiRes.status === 403) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!apiRes.ok) {
    return NextResponse.json(
      { error: 'No se ha podido cancelar. Inténtalo de nuevo.' },
      { status: 503 },
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
