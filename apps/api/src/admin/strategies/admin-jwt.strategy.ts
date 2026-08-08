import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AdminRole } from '@morer/database';
import { PrismaService } from '../../database/prisma.service';

export interface AdminJwtPayload {
  sub: string;
  type: string;
  role?: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedAdmin {
  id: string;
  email: string;
  role: AdminRole;
}

// Phase 11J (R1) — admin authentication, fully SEPARATE from the customer 'jwt'
// strategy: a distinct secret (ADMIN_JWT_SECRET) and audience ('morer-admin'), so a
// customer token can never verify here (wrong signature/audience) and vice versa. The
// role is loaded from the DB on every request — a tampered `role` claim is ignored,
// and a disabled/deleted admin is rejected even with an otherwise-valid token.
@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(private readonly prisma: PrismaService) {
    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret) {
      throw new Error('ADMIN_JWT_SECRET is required for AdminModule');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      algorithms: ['HS256'],
      audience: 'morer-admin',
    });
  }

  async validate(payload: AdminJwtPayload): Promise<AuthenticatedAdmin> {
    if (payload.type !== 'admin' || !payload.sub) {
      throw new UnauthorizedException('Not an admin token');
    }
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, disabledAt: true },
    });
    if (!admin) {
      throw new UnauthorizedException('Admin not found');
    }
    if (admin.disabledAt !== null) {
      throw new UnauthorizedException('Admin account is disabled');
    }
    // Role comes from the DB, never from the (client-supplied) claim.
    return { id: admin.id, email: admin.email, role: admin.role };
  }
}
