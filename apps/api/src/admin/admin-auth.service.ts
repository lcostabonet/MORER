import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import type { AdminLoginDto } from './dto/admin-login.dto';

// Timing mitigation: a fixed bcrypt hash so a login attempt for a missing / password-less
// admin still spends the same time as a real compare (no account-existence oracle).
const DUMMY_HASH = bcrypt.hashSync('__morer_admin_dummy__', 12);

export interface AdminLoginResult {
  token: string;
  role: string;
  email: string;
}

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // Authenticates an AdminUser and issues an ADMIN JWT (separate secret + audience
  // from the customer JWT). Uniform "Invalid credentials" for every failure mode;
  // passwordHash is never selected into a response.
  async login(dto: AdminLoginDto): Promise<AdminLoginResult> {
    const emailNormalized = dto.email.trim().toLowerCase();
    const admin = await this.prisma.adminUser.findUnique({
      where: { emailNormalized },
      select: { id: true, email: true, role: true, passwordHash: true, disabledAt: true },
    });

    // Always run one compare (real or dummy) before branching → constant-ish timing.
    const passwordMatch = await bcrypt.compare(dto.password, admin?.passwordHash ?? DUMMY_HASH);

    if (!admin || !admin.passwordHash || admin.disabledAt !== null || !passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.jwtService.signAsync(
      { sub: admin.id, type: 'admin', role: admin.role },
      { audience: 'morer-admin' },
    );
    return { token, role: admin.role, email: admin.email };
  }
}
