import { NextRequest, NextResponse } from 'next/server';
import { getApiUrl, COOKIE_NAME, clearAuthCookies } from '@/lib/auth';
import { checkCsrf } from '@/lib/csrf';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrfCheck = checkCsrf(request);
  if (csrfCheck) return csrfCheck;

  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (token) {
    try {
      const apiUrl = getApiUrl();
      await fetch(apiUrl + '/auth/logout-all', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });
    } catch {
      const response = NextResponse.json(
        { success: true, message: 'Sesión cerrada localmente. No se pudo confirmar la revocación remota.' },
        { status: 200 },
      );
      clearAuthCookies(response);
      return response;
    }
  }

  const response = NextResponse.json({ success: true }, { status: 200 });
  clearAuthCookies(response);
  return response;
}
