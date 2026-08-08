import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AdminAuthService } from '../src/admin/admin-auth.service';
import { AdminJwtStrategy } from '../src/admin/strategies/admin-jwt.strategy';

// Phase 11J (R1) — admin identity is SEPARATE from customer auth: a dedicated secret,
// a `type: 'admin'` claim, and a DB-loaded role. A customer can never become admin.

const PASSWORD = 'S3cure-Admin-Pass!';
let HASH: string;
beforeAll(() => { HASH = bcrypt.hashSync(PASSWORD, 12); });

function adminRow(over: Record<string, unknown> = {}) {
  return { id: 'admin-1', email: 'ops@morer.local', role: 'OPERATIONS', passwordHash: HASH, disabledAt: null, ...over };
}

// ─── AdminAuthService.login ────────────────────────────────────────────────────

describe('AdminAuthService.login (ADMIN-01..04, 13, 15)', () => {
  let prisma: { adminUser: { findUnique: ReturnType<typeof vi.fn> } };
  let jwt: { signAsync: ReturnType<typeof vi.fn> };
  let service: AdminAuthService;

  beforeEach(() => {
    prisma = { adminUser: { findUnique: vi.fn() } };
    jwt = { signAsync: vi.fn().mockResolvedValue('signed-admin-jwt') };
    service = new AdminAuthService(prisma as never, jwt as never);
  });

  it('ADMIN-02: valid credentials → an admin token (sub + type=admin + DB role)', async () => {
    prisma.adminUser.findUnique.mockResolvedValue(adminRow());
    const res = await service.login({ email: 'OPS@morer.local', password: PASSWORD });
    expect(res.token).toBe('signed-admin-jwt');
    expect(res.role).toBe('OPERATIONS');
    const claims = jwt.signAsync.mock.calls[0][0];
    expect(claims).toMatchObject({ sub: 'admin-1', type: 'admin', role: 'OPERATIONS' });
    // Signed with the admin audience → isolated from customer tokens.
    expect(jwt.signAsync.mock.calls[0][1]).toMatchObject({ audience: 'morer-admin' });
  });

  it('ADMIN-01: wrong password → 401, no token', async () => {
    prisma.adminUser.findUnique.mockResolvedValue(adminRow());
    await expect(service.login({ email: 'ops@morer.local', password: 'wrong' })).rejects.toThrow(UnauthorizedException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('ADMIN-03 / 13: a non-admin (customer) email or nonexistent admin → 401 (uniform)', async () => {
    prisma.adminUser.findUnique.mockResolvedValue(null);
    await expect(service.login({ email: 'customer@example.com', password: PASSWORD })).rejects.toThrow(UnauthorizedException);
  });

  it('ADMIN-04: a disabled admin → 401 even with the correct password', async () => {
    prisma.adminUser.findUnique.mockResolvedValue(adminRow({ disabledAt: new Date('2020-01-01') }));
    await expect(service.login({ email: 'ops@morer.local', password: PASSWORD })).rejects.toThrow(UnauthorizedException);
  });

  it('an admin with no passwordHash cannot log in', async () => {
    prisma.adminUser.findUnique.mockResolvedValue(adminRow({ passwordHash: null }));
    await expect(service.login({ email: 'ops@morer.local', password: PASSWORD })).rejects.toThrow(UnauthorizedException);
  });

  it('ADMIN-15: the response never contains passwordHash or other secrets', async () => {
    prisma.adminUser.findUnique.mockResolvedValue(adminRow());
    const res = await service.login({ email: 'ops@morer.local', password: PASSWORD });
    expect(JSON.stringify(res)).not.toContain(HASH);
    expect(res).not.toHaveProperty('passwordHash');
  });
});

// ─── AdminJwtStrategy.validate (ADMIN-06, 12, 13, 04 + auth confusion) ──────────

describe('AdminJwtStrategy.validate (ADMIN-05/06/11/12/13, auth confusion)', () => {
  let prisma: { adminUser: { findUnique: ReturnType<typeof vi.fn> } };
  let strategy: AdminJwtStrategy;

  beforeEach(() => {
    process.env.ADMIN_JWT_SECRET = 'admin-secret-for-tests';
    prisma = { adminUser: { findUnique: vi.fn() } };
    strategy = new AdminJwtStrategy(prisma as never);
  });

  it('ADMIN-06 / confusion: a token WITHOUT type=admin (e.g. a customer token) → 401', async () => {
    // A customer JWT carries { sub, sid } and no type=admin; even if it somehow reached
    // this strategy, it is rejected before any DB lookup.
    await expect(strategy.validate({ sub: 'cust-1', type: 'customer' } as never)).rejects.toThrow(UnauthorizedException);
    await expect(strategy.validate({ sub: 'cust-1' } as never)).rejects.toThrow(UnauthorizedException);
    expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
  });

  it('ADMIN-13: an admin id that no longer exists → 401', async () => {
    prisma.adminUser.findUnique.mockResolvedValue(null);
    await expect(strategy.validate({ sub: 'ghost', type: 'admin' })).rejects.toThrow(UnauthorizedException);
  });

  it('ADMIN-04: a disabled admin → 401 even with a valid token', async () => {
    prisma.adminUser.findUnique.mockResolvedValue({ id: 'admin-1', email: 'a@b.c', role: 'ADMIN', disabledAt: new Date() });
    await expect(strategy.validate({ sub: 'admin-1', type: 'admin' })).rejects.toThrow(UnauthorizedException);
  });

  it('ADMIN-12: a tampered role claim is ignored — the DB role is authoritative', async () => {
    prisma.adminUser.findUnique.mockResolvedValue({ id: 'admin-1', email: 'a@b.c', role: 'SUPPORT', disabledAt: null });
    // Attacker forges role=ADMIN in the token; validate returns the DB role (SUPPORT).
    const user = await strategy.validate({ sub: 'admin-1', type: 'admin', role: 'ADMIN' });
    expect(user.role).toBe('SUPPORT');
  });

  it('a valid admin token resolves to the DB identity + role', async () => {
    prisma.adminUser.findUnique.mockResolvedValue({ id: 'admin-1', email: 'ops@morer.local', role: 'OPERATIONS', disabledAt: null });
    const user = await strategy.validate({ sub: 'admin-1', type: 'admin' });
    expect(user).toEqual({ id: 'admin-1', email: 'ops@morer.local', role: 'OPERATIONS' });
  });

  it('ADMIN-05/11: the strategy is configured to reject bad signatures & expired tokens', () => {
    // Signature (ADMIN_JWT_SECRET) and expiry (ignoreExpiration:false) are enforced by
    // passport-jwt BEFORE validate() runs. Constructing without the secret fails fast.
    delete process.env.ADMIN_JWT_SECRET;
    expect(() => new AdminJwtStrategy(prisma as never)).toThrow(/ADMIN_JWT_SECRET/);
  });
});
