import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl, COOKIE_NAME } from '@/lib/auth';
import { checkCsrf } from '@/lib/csrf';

// Generic, non-enumerating response — identical whether or not a new email was
// actually sent (already-verified accounts get the same message).
const SUCCESS_RESPONSE = {
  success: true,
  message:
    'Si tu correo está pendiente de verificación, recibirás un nuevo enlace.',
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrfCheck = checkCsrf(request);
  if (csrfCheck) return csrfCheck;

  // resend-verification is authenticated — forward the httpOnly JWT cookie as a
  // Bearer token. The raw cookie value never reaches the browser response.
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiUrl = getApiUrl();

  let apiRes: Response;
  try {
    apiRes = await fetch(`${apiUrl}/auth/resend-verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    // Network failure to the API — return the same generic message rather than
    // leaking a service error (mirrors the forgot-password BFF behaviour).
    return NextResponse.json(SUCCESS_RESPONSE, { status: 200 });
  }

  if (apiRes.status === 401 || apiRes.status === 403) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (apiRes.status === 429) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Inténtalo de nuevo más tarde.' },
      { status: 429 },
    );
  }

  // Any other outcome (including the API's own success) collapses to the same
  // controlled generic response — provider details are never forwarded.
  return NextResponse.json(SUCCESS_RESPONSE, { status: 200 });
}
