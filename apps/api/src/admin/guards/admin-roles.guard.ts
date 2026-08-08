import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminRole } from '@morer/database';
import { ADMIN_ROLES_KEY } from '../decorators/admin-roles.decorator';

// RBAC on top of AdminJwtAuthGuard: authentication alone is not enough — the admin's
// DB role must be in the handler's @AdminRoles(...) allowlist, else 403.
@Injectable()
export class AdminRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AdminRole[] | undefined>(ADMIN_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<{ user?: { role?: AdminRole } }>();
    const role = req.user?.role;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException('Insufficient admin role');
    }
    return true;
  }
}
