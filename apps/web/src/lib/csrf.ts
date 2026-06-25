import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getWebOrigin } from './auth';

/**
 * CSRF protection for state-mutating Route Handlers.
 * Returns 403 response if the check fails, or null if it passes.
 * Do NOT apply to Stripe webhooks or server-to-server routes.
 *
 * Blocks: cross-site, same-site (admin.morer.es != customer session), null origin.
 * Production: requires origin === WEB_ORIGIN or valid referer origin.
 * Development: allows missing origin (curl, Postman, test tools).
 */
export function checkCsrf(request: NextRequest): NextResponse | null {
  const isProd = process.env.NODE_ENV === 'production';
  const secFetchSite = request.headers.get('sec-fetch-site');

  // Block cross-site and same-site (different subdomain counts as same-site).
  if (secFetchSite === 'cross-site' || secFetchSite === 'same-site') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const origin = request.headers.get('origin');

  // Sandboxed iframe / file:// sends literal "null" — always reject.
  if (origin === 'null') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (origin !== null) {
    if (isProd) {
      let webOrigin: string;
      try { webOrigin = getWebOrigin(); } catch {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (origin !== webOrigin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    // Dev: any real (non-null) origin accepted.
  } else {
    // No origin header at all.
    if (isProd) {
      const referer = request.headers.get('referer');
      if (!referer) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      let refOrigin: string;
      try { refOrigin = new URL(referer).origin; } catch {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      let webOrigin: string;
      try { webOrigin = getWebOrigin(); } catch {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (refOrigin !== webOrigin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    // Dev: missing origin allowed.
  }

  return null; // Passes.
}
