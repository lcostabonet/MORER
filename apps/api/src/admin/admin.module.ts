import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { DatabaseModule } from '../database';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminJwtStrategy } from './strategies/admin-jwt.strategy';
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from './guards/admin-roles.guard';

// Admin authentication + RBAC (Phase 11J). Uses its OWN JwtModule bound to
// ADMIN_JWT_SECRET so admin tokens are cryptographically isolated from customer tokens.
@Module({
  imports: [
    DatabaseModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.ADMIN_JWT_SECRET ?? '',
      signOptions: { algorithm: 'HS256', expiresIn: '8h' },
    }),
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminJwtStrategy, AdminJwtAuthGuard, AdminRolesGuard],
  exports: [AdminJwtStrategy, AdminJwtAuthGuard, AdminRolesGuard],
})
export class AdminModule {}
