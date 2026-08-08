/**
 * Phase 11J (R5) — the legacy guest-checkout dead code (CheckoutButton / web
 * startCheckout) is removed, and no client-side path can obtain the guest order
 * access capability. The capability lives ONLY in httpOnly cookies (see
 * order-access-routes.test.ts); it is never in client JS, storage, or a readable cookie.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const SRC = resolve(__dirname, '..', 'src');
function read(rel: string): string {
  return readFileSync(resolve(SRC, rel), 'utf8');
}
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const ALL_FILES = walk(SRC);
// Client components/hooks: files that opt into the browser runtime with 'use client'.
const CLIENT_FILES = ALL_FILES.filter((f) => /^['"]use client['"]/.test(readFileSync(f, 'utf8').trimStart()));

describe('GUEST-DEAD — guest checkout removed, capability never in JS (11J R5)', () => {
  it('GUEST-DEAD-01: the CheckoutButton component no longer exists', () => {
    expect(existsSync(resolve(SRC, 'components/checkout-button.tsx'))).toBe(false);
  });

  it('GUEST-DEAD-02: the client checkout API exposes no startCheckout (no token-returning path)', async () => {
    const mod = await import('@/lib/checkout-api');
    expect(mod).not.toHaveProperty('startCheckout');
    // No live fetch to the guest checkout endpoint (ignore comments — match a real call).
    expect(read('lib/checkout-api.ts')).not.toMatch(/fetch\([^)]*\/checkout\/from-cart/);
  });

  it('GUEST-DEAD-03/04: no localStorage/sessionStorage USAGE anywhere in web src', () => {
    // Match real access (localStorage.getItem / localStorage[...]) — not the word in a comment.
    const usage = /\b(local|session)Storage\s*(\.\s*(getItem|setItem|removeItem|clear|key)|\[)/;
    for (const f of ALL_FILES) {
      expect(readFileSync(f, 'utf8'), `${f} uses web storage`).not.toMatch(usage);
    }
  });

  it('GUEST-DEAD-05/06/07: no CLIENT file references the order access capability', () => {
    // The capability (accessToken / morer_oat cookie) is handled ONLY server-side
    // (BFF routes + the server-only order-access lib). No 'use client' file may touch it.
    for (const f of CLIENT_FILES) {
      const src = readFileSync(f, 'utf8');
      expect(src, `${f} references accessToken`).not.toContain('accessToken');
      expect(src, `${f} reads the capability cookie`).not.toContain('morer_oat');
    }
    // And the browser-facing API clients never carry it either.
    for (const f of ['lib/checkout-api.ts', 'lib/payments-api.ts']) {
      expect(read(f)).not.toContain('accessToken');
    }
  });

  it('GUEST-DEAD: the server-only order-access lib guards the cookie as httpOnly', () => {
    const src = read('lib/order-access.ts');
    expect(src).toContain('httpOnly: true');
    expect(src).toContain("import 'server-only'");
  });
});
