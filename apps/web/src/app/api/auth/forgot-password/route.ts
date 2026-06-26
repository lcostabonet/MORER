import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl } from '@/lib/auth';
import { checkCsrf } from '@/lib/csrf';

const SUCCESS_RESPONSE = {
  success: true,
  message:
    'Si existe una cuenta asociada a ese correo, recibirás instrucciones para restablecer la contraseña.',
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrfCheck = checkCsrf(request);
  if (csrfCheck) return csrfCheck;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // Always return the generic success message — never reveal whether email exists
    return NextResponse.json(SUCCESS_RESPONSE, { status: 200 });
  }

  const { email } = body as Record<string, unknown>;

  if (typeof email !== 'string') {
    return NextResponse.json(SUCCESS_RESPONSE, { status: 200 });
  }

  // Fire-and-forget: we do not await failure to change the response
  try {
    const apiUrl = getApiUrl();
    await fetch(`${apiUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    });
  } catch {
    // Intentionally swallowed — always return the same response
  }

  return NextResponse.json(SUCCESS_RESPONSE, { status: 200 });
}
