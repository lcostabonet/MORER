import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { EmailService } from '../email/email.service';
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
const RESET_TOKEN_EXPIRY_MS = 30 * 60 * 1000;
const EMAIL_VERIFY_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const JWT_EXPIRY = '7d';

// Shared, centralized message for every invalid email-verification case so the
// API never leaks which specific reason (unknown / used / expired / malformed)
// caused the failure.
const INVALID_VERIFICATION_MSG =
  'El enlace de verificación no es válido o ha caducado.';

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
  emailVerifiedAt: Date | null;
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
      select: {
        id: true;
        email: true;
        firstName: true;
        lastName: true;
        emailVerifiedAt: true;
      };
    }): Promise<{
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      emailVerifiedAt: Date | null;
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
    update(args: {
      where: { id: string };
      data: { passwordHash?: string; emailVerifiedAt?: Date };
    }): Promise<unknown>;
  };
  authSession: AuthSessionModel;
  passwordResetToken: {
    upsert(args: {
      where: { customerId: string };
      create: { customerId: string; tokenHash: string; expiresAt: Date };
      update: { tokenHash: string; expiresAt: Date; usedAt: null };
    }): Promise<unknown>;
    findUnique(args: {
      where: { tokenHash: string };
      include: {
        customer: {
          select: { id: true; passwordHash: true; registeredAt: true };
        };
      };
    }): Promise<{
      id: string;
      customerId: string;
      tokenHash: string;
      expiresAt: Date;
      usedAt: Date | null;
      customer: {
        id: string;
        passwordHash: string | null;
        registeredAt: Date | null;
      } | null;
    } | null>;
    updateMany(args: {
      where: {
        id: string;
        tokenHash: string;
        usedAt: null;
        expiresAt: { gt: Date };
      };
      data: { usedAt: Date };
    }): Promise<{ count: number }>;
  };
  emailVerificationToken: {
    upsert(args: {
      where: { customerId: string };
      create: { customerId: string; tokenHash: string; expiresAt: Date };
      update: { tokenHash: string; expiresAt: Date; usedAt: null };
    }): Promise<unknown>;
    findUnique(args: {
      where: { tokenHash: string };
      include: {
        customer: {
          select: { id: true; passwordHash: true; registeredAt: true };
        };
      };
    }): Promise<{
      id: string;
      customerId: string;
      tokenHash: string;
      expiresAt: Date;
      usedAt: Date | null;
      customer: {
        id: string;
        passwordHash: string | null;
        registeredAt: Date | null;
      } | null;
    } | null>;
    updateMany(args: {
      where: {
        id: string;
        tokenHash: string;
        usedAt: null;
        expiresAt: { gt: Date };
      };
      data: { usedAt: Date };
    }): Promise<{ count: number }>;
  };
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
  private readonly logger = new Logger(AuthService.name);

  // Stored as unknown so the stale PrismaService type cannot flow back through
  // the db getter and cause TS errors on fields the old generated client lacks.
  // Remove once `prisma generate` has been re-run against the current schema.
  private readonly _db: unknown;

  constructor(
    // Plain parameter (no field shorthand) so NestJS can inject PrismaService
    // while we store it via _db: unknown to break the stale type chain.
    prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
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

      try {
        await this.emailService.sendWelcomeEmailIfNeeded(customer.id);
      } catch (err) {
        this.logger.warn('welcome-email-register-error', { customerId: customer.id });
      }

      // Email verification is issued outside the critical write: a Resend
      // failure (or token-issue failure) must never revert registration or the
      // auto-login that follows. The welcome email above is left untouched.
      try {
        await this.issueEmailVerificationToken(customer.id);
      } catch (err) {
        this.logger.warn('email-verification-register-error', { customerId: customer.id });
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

    try {
      await this.emailService.sendWelcomeEmailIfNeeded(customer.id);
    } catch (err) {
      this.logger.warn('welcome-email-login-error', { customerId: customer.id });
    }

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

  async getMe(
    userId: string,
  ): Promise<CustomerProfile & { emailVerified: boolean }> {
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
        emailVerifiedAt: true,
      },
    });

    if (customer === null) {
      throw new UnauthorizedException();
    }

    // Expose only a boolean — never the raw emailVerifiedAt timestamp.
    return {
      id: customer.id,
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      emailVerified: customer.emailVerifiedAt !== null,
    };
  }

  async forgotPassword(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();

    const customer = await this.db.customer.findUnique({
      where: { emailNormalized: normalized },
    });

    // Return silently for all ineligible cases — never reveal account existence.
    if (!customer) return;
    if (!customer.passwordHash) return;
    if (!customer.registeredAt) return;
    if (/^anon-/i.test(customer.email) || customer.email.endsWith('@morer-checkout.local')) return;

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

    await this.db.passwordResetToken.upsert({
      where: { customerId: customer.id },
      create: { customerId: customer.id, tokenHash, expiresAt },
      update: { tokenHash, expiresAt, usedAt: null },
    });

    const webUrl = process.env.WEB_URL ?? 'https://morer.com';
    const resetUrl = webUrl + '/reset-password?token=' + encodeURIComponent(rawToken);

    try {
      await this.emailService.sendPasswordResetEmail({
        customerId: customer.id,
        email: customer.email,
        firstName: customer.firstName,
        resetUrl,
      });
    } catch {
      // Email failure must not surface to the caller.
      this.logger.warn('password-reset-email-error', { customerId: customer.id });
    }
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const now = new Date();

    const resetRecord = await this.db.passwordResetToken.findUnique({
      where: { tokenHash },
      include: {
        customer: { select: { id: true, passwordHash: true, registeredAt: true } },
      },
    });

    const INVALID_MSG = 'El enlace de recuperación no es válido o ha caducado.';

    if (!resetRecord) throw new BadRequestException(INVALID_MSG);
    if (resetRecord.usedAt) throw new BadRequestException(INVALID_MSG);
    if (resetRecord.expiresAt <= now) throw new BadRequestException(INVALID_MSG);
    if (!resetRecord.customer?.passwordHash) throw new BadRequestException(INVALID_MSG);
    if (!resetRecord.customer?.registeredAt) throw new BadRequestException(INVALID_MSG);

    // Hash outside the transaction — bcrypt is expensive and must not block the tx.
    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await (this._db as {
      $transaction(fn: (tx: PrismaWithSessions) => Promise<void>): Promise<void>;
    }).$transaction(async (tx) => {
      // Atomic consume — re-check conditions inside the transaction.
      const consumed = await tx.passwordResetToken.updateMany({
        where: {
          id: resetRecord.id,
          tokenHash,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });

      if (consumed.count !== 1) {
        throw new BadRequestException(INVALID_MSG);
      }

      await tx.customer.update({
        where: { id: resetRecord.customerId },
        data: { passwordHash: newHash },
      });

      await tx.authSession.updateMany({
        where: { customerId: resetRecord.customerId, revokedAt: null },
        data: { revokedAt: now },
      });
    });
  }

  // ─── Email verification ───────────────────────────────────────────────────────

  /**
   * Issues a fresh email-verification token for a customer and sends the email.
   *
   * Only acts for real, still-unverified accounts:
   *   - passwordHash != null AND registeredAt != null (registered, not a guest)
   *   - emailVerifiedAt == null (not already verified)
   *   - non-synthetic email (not an anon-* / @morer-checkout.local address)
   *
   * Idempotent at the row level via upsert keyed by customerId: a second call
   * REPLACES the previous token, invalidating any earlier link. Never logs or
   * returns the raw token, the hash, or the full URL. Email-send failures are
   * swallowed by EmailService and never surface to the caller.
   */
  private async issueEmailVerificationToken(customerId: string): Promise<void> {
    let customer: CustomerRow | null;
    try {
      customer = await this.db.customer.findUnique({ where: { id: customerId } });
    } catch {
      this.logger.warn('email-verification-load-error', { customerId });
      return;
    }

    // Silent no-op for every ineligible case — never reveal account state.
    if (!customer) return;
    if (!customer.passwordHash) return;
    if (!customer.registeredAt) return;
    if (customer.emailVerifiedAt) return;
    if (
      /^anon-/i.test(customer.email) ||
      customer.email.endsWith('@morer-checkout.local')
    ) {
      return;
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + EMAIL_VERIFY_TOKEN_EXPIRY_MS);

    await this.db.emailVerificationToken.upsert({
      where: { customerId: customer.id },
      create: { customerId: customer.id, tokenHash, expiresAt },
      update: { tokenHash, expiresAt, usedAt: null },
    });

    const webUrl = process.env.WEB_URL ?? 'https://morer.com';
    const verifyUrl =
      webUrl + '/verify-email?token=' + encodeURIComponent(rawToken);

    try {
      await this.emailService.sendVerificationEmail({
        customerId: customer.id,
        email: customer.email,
        firstName: customer.firstName,
        verifyUrl,
      });
    } catch {
      // Email failure must not surface to the caller.
      this.logger.warn('email-verification-email-error', { customerId: customer.id });
    }
  }

  /**
   * Re-sends the verification email for an authenticated customer.
   *
   * The controller calls this behind JwtAuthGuard and always returns a generic
   * success message, so callers cannot distinguish "already verified" from
   * "email sent". Issuing a new token invalidates the previous one (upsert).
   */
  async resendVerification(customerId: string): Promise<void> {
    await this.issueEmailVerificationToken(customerId);
  }

  /**
   * Verifies a customer's email from a raw token.
   *
   * Mirrors resetPassword: SHA-256 the token, locate the row, validate, then
   * atomically consume it (updateMany guarded by usedAt:null + expiresAt) and
   * set Customer.emailVerifiedAt — both inside one transaction so a failure
   * rolls back entirely. Every invalid case (unknown / used / replaced /
   * expired / non-real-customer) throws the SAME 400 message. Two concurrent
   * verifications race on the conditional updateMany: only one gets count === 1.
   */
  async verifyEmail(rawToken: string): Promise<void> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const now = new Date();

    const record = await this.db.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: {
        customer: { select: { id: true, passwordHash: true, registeredAt: true } },
      },
    });

    if (!record) throw new BadRequestException(INVALID_VERIFICATION_MSG);
    if (record.usedAt) throw new BadRequestException(INVALID_VERIFICATION_MSG);
    if (record.expiresAt <= now) throw new BadRequestException(INVALID_VERIFICATION_MSG);
    if (!record.customer?.passwordHash) throw new BadRequestException(INVALID_VERIFICATION_MSG);
    if (!record.customer?.registeredAt) throw new BadRequestException(INVALID_VERIFICATION_MSG);

    await (this._db as {
      $transaction(fn: (tx: PrismaWithSessions) => Promise<void>): Promise<void>;
    }).$transaction(async (tx) => {
      // Atomic consume — re-check conditions inside the transaction.
      const consumed = await tx.emailVerificationToken.updateMany({
        where: {
          id: record.id,
          tokenHash,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });

      if (consumed.count !== 1) {
        throw new BadRequestException(INVALID_VERIFICATION_MSG);
      }

      await tx.customer.update({
        where: { id: record.customerId },
        data: { emailVerifiedAt: now },
      });
    });
  }
}
