import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../database/prisma.service';

export interface JwtPayload {
  sub: string;
  sid: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  sessionId: string;
}

// ─── Local schema aliases ─────────────────────────────────────────────────────
// The generated Prisma client in node_modules may be stale (pre-dating the
// AuthSession model and the passwordHash/registeredAt columns on Customer).
// These interfaces reflect the real schema. Remove after running `prisma generate`.

interface AuthSessionRow {
  id: string;
  customerId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CustomerRowWithHash {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  passwordHash: string | null;
  registeredAt: Date | null;
}

interface PrismaWithSessions {
  authSession: {
    findUnique(args: { where: { id: string } }): Promise<AuthSessionRow | null>;
  };
  customer: {
    findUnique(args: {
      where: { id?: string };
      select: {
        id: true;
        email: true;
        firstName: true;
        lastName: true;
        passwordHash: true;
        registeredAt: true;
      };
    }): Promise<CustomerRowWithHash | null>;
  };
}
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  // Typed as unknown first so that subsequent assignment to PrismaWithSessions
  // does not flow back through PrismaService and cause stale-client TS errors.
  // Remove the cast and this field once `prisma generate` has been re-run.
  private readonly _db: unknown;

  constructor(private readonly prisma: PrismaService) {
    const secret = process.env.JWT_SECRET;
    const issuer = process.env.JWT_ISSUER;
    const audience = process.env.JWT_AUDIENCE;

    if (!secret) {
      throw new Error('JWT_SECRET is required');
    }
    if (!issuer) {
      throw new Error('JWT_ISSUER is required');
    }
    if (!audience) {
      throw new Error('JWT_AUDIENCE is required');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      issuer,
      audience,
      algorithms: ['HS256'],
    });

    this._db = prisma;
  }

  private get db(): PrismaWithSessions {
    return this._db as PrismaWithSessions;
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload.sid) {
      throw new UnauthorizedException('Invalid token: missing session id');
    }

    const session = await this.db.authSession.findUnique({
      where: { id: payload.sid },
    });

    if (!session) {
      throw new UnauthorizedException('Session not found');
    }
    if (session.customerId !== payload.sub) {
      throw new UnauthorizedException('Session does not belong to this user');
    }
    if (session.revokedAt !== null) {
      throw new UnauthorizedException('Session has been revoked');
    }
    if (session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Session has expired');
    }

    const customer = await this.db.customer.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        passwordHash: true,
        registeredAt: true,
      },
    });

    if (!customer) {
      throw new UnauthorizedException('Customer not found');
    }
    if (customer.passwordHash === null) {
      throw new UnauthorizedException('Customer has no password (guest account)');
    }
    if (customer.registeredAt === null) {
      throw new UnauthorizedException('Customer is not fully registered');
    }

    return {
      id: customer.id,
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      sessionId: session.id,
    };
  }
}
