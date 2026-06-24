import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
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
// 5. JWT
//    Tokens expire in 7 days. The secret is read at runtime so tests can
//    override it via process.env without module re-initialisation.
//    AuthService also validates JWT_SECRET at construction time (fast-fail).
// ─────────────────────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 12;
const JWT_EXPIRY = '7d';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is required');
    }
  }

  async register(dto: RegisterDto): Promise<CustomerProfile> {
    const normalized = dto.email.trim().toLowerCase();
    const original = dto.email.trim();

    // Reject if a fully-registered account already exists for this email.
    const existing = await this.prisma.customer.findUnique({
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
        const { count } = await this.prisma.customer.updateMany({
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
        customer = await this.prisma.customer.findUniqueOrThrow({
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
        customer = await this.prisma.customer.create({
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

    const customer = await this.prisma.customer.findUnique({
      where: { emailNormalized: normalized },
    });

    if (customer === null) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Guest customers have no password — cannot log in.
    if (customer.passwordHash === null || customer.registeredAt === null) {
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

    const accessToken = this.jwtService.sign(
      { sub: customer.id, email: customer.email },
      { secret: jwtSecret, expiresIn: JWT_EXPIRY },
    );

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

  async getMe(userId: string): Promise<CustomerProfile> {
    const customer = await this.prisma.customer.findFirst({
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
