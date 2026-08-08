import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Requires a valid ADMIN JWT (the 'admin-jwt' strategy). A missing/invalid/expired
// token, or a customer token, is rejected with 401.
@Injectable()
export class AdminJwtAuthGuard extends AuthGuard('admin-jwt') {}
