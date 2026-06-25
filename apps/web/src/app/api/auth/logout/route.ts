import { NextResponse } from 'next/server';
import { COOKIE_NAME, COOKIE_OPTIONS } from '@/lib/auth';

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({ success: true }, { status: 200 });
  response.cookies.set(COOKIE_NAME, '', { ...COOKIE_OPTIONS, maxAge: 0 });
  return response;
}
