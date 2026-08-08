import { SetMetadata } from '@nestjs/common';
import type { AdminRole } from '@morer/database';

export const ADMIN_ROLES_KEY = 'adminRoles';

// Declares which AdminRole(s) may access a handler. Enforced by AdminRolesGuard,
// which reads the role from the authenticated admin (DB-loaded), not from the token.
export const AdminRoles = (...roles: AdminRole[]) => SetMetadata(ADMIN_ROLES_KEY, roles);
