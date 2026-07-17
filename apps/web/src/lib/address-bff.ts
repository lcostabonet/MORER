import { NextResponse } from 'next/server';

export const SESSION_EXPIRED = 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
export const GENERIC_ERROR =
  'No se ha podido procesar la solicitud. Inténtalo de nuevo.';

// The only fields a client may set on an address. customerId and any unknown
// property are dropped before the payload reaches the API.
const ADDRESS_FIELDS = [
  'fullName',
  'phone',
  'line1',
  'line2',
  'postalCode',
  'city',
  'province',
  'countryCode',
  'type',
  'isDefaultShipping',
  'isDefaultBilling',
] as const;

export function pickAddressPayload(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null) return {};
  const src = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of ADDRESS_FIELDS) {
    if (field in src) out[field] = src[field];
  }
  return out;
}

// Maps a non-ok API response to a safe client response: 401/403 → a session
// message; other 4xx → the API's user-facing `message` (never statusText or an
// internal error); anything else → a generic 503.
export async function forwardApiError(apiRes: Response): Promise<NextResponse> {
  if (apiRes.status === 401 || apiRes.status === 403) {
    return NextResponse.json({ error: SESSION_EXPIRED }, { status: 401 });
  }
  if (apiRes.status >= 400 && apiRes.status < 500) {
    let message = GENERIC_ERROR;
    try {
      const data = (await apiRes.json()) as { message?: unknown };
      if (typeof data.message === 'string' && data.message.length > 0) {
        message = data.message;
      }
    } catch {
      // keep generic
    }
    return NextResponse.json({ error: message }, { status: apiRes.status });
  }
  return NextResponse.json({ error: GENERIC_ERROR }, { status: 503 });
}
