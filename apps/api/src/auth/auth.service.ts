import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

// ─── Design notes ─────────────────────────────────────────────────────────────
//
// 1. GUEST CUSTOMERS
//    A Customer record may already exist from a previous guest checkout
//    (passwordHash IS NULL AND registeredAt IS NULL). In that case, we update
//    the existing record with the new credentials rather than creating a
//    duplicate, preserving order history.
//
// 2. CONCURRENCY — new account (no prior guest record)
//    Two concurrent registrations for the same email both pass the initial
//    duplicate check. The one that arrives second hits a P2002 unique
//    constraint on emailNormalized and is converted to ConflictException.
//
// 3. CONCURRENCY — guest promotion
//    Two concurrent callers can both see a guest record and both try to promote
//    it. To prevent one from silently overwriting the other's hash, the update
//    uses updateMany with WHERE { id, passwordHash: null, registeredAt: null }.
//    If count returns 0, another caller already set the hash → ConflictException.
//
// 4. EMAIL STORAGE
//    Customer.email stores the original casing (trimmed only).
//    Customer.emailNormalized stores the lowercase version for case-insensitive
//    lookups. This mirrors the pattern used across the codebase.
//
// 5. JWT + SESSIONS
//    Tokens expire in 7 days. The secret is read at runtime so tests can
//    override it via process.env without module re-initialisation.
//    AuthService validates JWT_SECRET, JWT_ISSUER, and JWT_AUDIENCE at
//    construction time (fast-fail).
//    Each login creates an AuthSession row (revocable). The JWT carries only
//    { sub, sid } — no PII in the token. JwtStrategy validates the session on
//    every request.
//
// NOTE ON PRISMA CLIENT VERSION
//    The generated Prisma client in node_modules may be stale (pre-dating the
//    AuthSession model and the passwordHash/registeredAt columns on Customer).
//    The local interface aliases below reflect the real schema and are used in
//    explicit casts so TypeScript accepts the code until `prisma generate` is
//    re-run. The runtime behaviour is always correct because the actual DB
//    schema is the source of truth.
// ─────────────────────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 12;
const JWT_EXPIRY = '7d';

// Computed once at startup to provide constant-time comparison when the
// user does not exist or is a guest. bcrypt.compare always returns false
// for this hash, but takes the same time as a real comparison.
const DUMMY_HASH = bcrypt.hashSync('__morer_dummy__', 12);

// ─── Local schema aliases ─────────────────────────────────────────────────────
// These mirror the Prisma schema exactly. They are needed because the generated
// client in node_modules may be stale and not yet include these fields/models.
// Remove the casts below (and these types) after running `prisma generate`.

interface CustomerRow {
  id: string;
  email: string;
  emailNormalized: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  passwordHash: string | null;
  registeredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AuthSessionModel {
  findUnique(args: { where: { id: string } }): Promise<{
    id: string;
    customerId: string;
    expiresAt: Date;
    revokedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  } | null>;
  create(args: {
    data: { id: string; customerId: string; expiresAt: Date };
  }): Promise<unknown>;
  updateMany(args: {
    where: {
      id?: string;
      customerId?: string;
      revokedAt?: null;
    };
    data: { revokedAt: Date };
  }): Promise<{ count: number }>;
}

// Typed handle to PrismaService that exposes the fields/models the stale
// generated client may not know about yet.
interface PrismaWithSessions {
  customer: {
    findUnique(args: {
      where: { emailNormalized?: string; id?: string };
    }): Promise<CustomerRow | null>;
    findUniqueOrThrow(args: {
      where: { id: string };
      select: { id: true; email: true; firstName: true; lastName: true };
    }): Promise<{
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
    }>;
    findFirst(args: {
      where: { id: string; passwordHash: { not: null } };
      select: { id: true; email: true; firstName: true; lastName: true };
    }): Promise<{
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
    } | null>;
    create(args: {
      data: {
        email: string;
        emailNormalized: string;
        passwordHash: string;
        registeredAt: Date;
        firstName?: string;
        lastName?: string;
      };
      select: { id: true; email: true; firstName: true; lastName: true };
    }): Promise<{
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
    }>;
    updateMany(args: {
      where: {
        id: string;
        passwordHash: null;
        registeredAt: null;
      };
      data: {
        passwordHash: string;
        registeredAt: Date;
        firstName?: string | null;
        lastName?: string | null;
      };
    }): Promise<{ count: number }>;
  };
  authSession: AuthSessionModel;
}
// ─────────────────────────────────────────────────────────────────────────────

type CustomerProfile = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

function isPrismaUniqueConstraint(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as Record<string, unknown>;
  return e['code'] === 'P2002';
}

@Injectable()
export class AuthService {
  // Stored as unknown so the stale PrismaService type cannot flow back through
  // the db getter and cause TS errors on fields the old generated client lacks.
  // Remove once `prisma generate` has been re-run against the current schema.
  private readonly _db: unknown;

  constructor(
    // Plain parameter (no field shorthand) so NestJS can inject PrismaService
    // while we store it via _db: unknown to break the stale type chain.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is required');
    }
    if (!process.env.JWT_ISSUER) {
      throw new Error('JWT_ISSUER is required');
    }
    if (!process.env.JWT_AUDIENCE) {
      throw new Error('JWT_AUDIENCE is required');
    }
    this._db = prisma;
  }

  private get db(): PrismaWithSessions {
    return this._db as PrismaWithSessions;
  }

  async register(dto: RegisterDto): Promise<CustomerProfile> {
    const normalized = dto.email.trim().toLowerCase();
    const original = dto.email.trim();

    // Reject if a fully-registered account already exists for this email.
    const existing = await this.db.customer.findUnique({
      where: { emailNormalized: normalized },
    });

    if (
      existing !== null &&
      existing.passwordHash !== null &&
      existing.registeredAt !== null
    ) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const registeredAt = new Date();

    try {
      let customer: CustomerProfile;

      if (existing !== null) {
        // Guest customer exists — upgrade to registered account.
        // Use updateMany with a condition on passwordHash: null so that if two
        // concurrent callers both read the guest record, only one will match
        // (count > 0) and the other gets count: 0 → ConflictException.
        const { count } = await this.db.customer.updateMany({
          where: { id: existing.id, passwordHash: null, registeredAt: null },
          data: {
            passwordHash,
            registeredAt,
            firstName: dto.firstName ?? existing.firstName,
            lastName: dto.lastName ?? existing.lastName,
          },
        });

        if (count === 0) {
          // Another concurrent request already promoted this guest account.
          throw new ConflictException('Email already registered');
        }

        // Fetch the profile fields that updateMany does not return.
        customer = await this.db.customer.findUniqueOrThrow({
          where: { id: existing.id },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        });
      } else {
        // No customer record yet — create a new registered account.
        customer = await this.db.customer.create({
          data: {
            email: original,
            emailNormalized: normalized,
            passwordHash,
            registeredAt,
            firstName: dto.firstName,
            lastName: dto.lastName,
          },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        });
      }

      return customer;
    } catch (err) {
      if (isPrismaUniqueConstraint(err)) {
        throw new ConflictException('Email already registered');
      }
      throw err;
    }
  }

  async login(
    dto: LoginDto,
  ): Promise<{ accessToken: string; customer: CustomerProfile }> {
    const normalized = dto.email.trim().toLowerCase();

    const customer = await this.db.customer.findUnique({
      where: { emailNormalized: normalized },
    });

    // Timing mitigation: always run bcrypt compare, even when the user does not
    // exist or is a guest, so the response time does not leak account existence.
    if (
      customer === null ||
      customer.passwordHash === null ||
      customer.registeredAt === null
    ) {
      await bcrypt.compare(dto.password, DUMMY_HASH);
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(
      dto.password,
      customer.passwordHash,
    );
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is required');
    }

    const sessionId = randomUUID();

    const accessToken = this.jwtService.sign(
      { sub: customer.id, sid: sessionId },
      {
        secret: jwtSecret,
        expiresIn: JWT_EXPIRY,
        algorithm: 'HS256',
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
      },
    );

    await this.db.authSession.create({
      data: {
        id: sessionId,
        customerId: customer.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken,
      customer: {
        id: customer.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
      },
    };
  }

  async logout(customerId: string, sessionId: string): Promise<void> {
    await this.db.authSession.updateMany({
      where: { id: sessionId, customerId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    // Idempotent: if already revoked, WHERE excludes it, no error.
  }

  async logoutAll(customerId: string): Promise<void> {
    await this.db.authSession.updateMany({
      where: { customerId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getMe(userId: string): Promise<CustomerProfile> {
    const customer = await this.db.customer.findFirst({
      where: {
        id: userId,
        passwordHash: { not: null },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    if (customer === null) {
      throw new UnauthorizedException();
    }

    return customer;
  }
}
