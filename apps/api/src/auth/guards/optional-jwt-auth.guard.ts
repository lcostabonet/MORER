import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Like JwtAuthGuard, but it NEVER rejects the request. When a valid Bearer token is
// present, req.user is populated with the AuthenticatedUser; when the token is
// missing, malformed, expired or belongs to a guest account, req.user is left
// undefined and the request still proceeds. Downstream authorization (the order
// access capability) then decides access. Endpoints that support BOTH a JWT owner
// and a guest capability use this guard.
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Overriding handleRequest so a missing/invalid user does not throw: the base
  // canActivate assigns this return value to req.user and resolves truthy, so the
  // handler runs either way.
  handleRequest<TUser = unknown>(_err: unknown, user: TUser | false): TUser | undefined {
    return user || undefined;
  }
}
