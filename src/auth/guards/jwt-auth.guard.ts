import { applyDecorators, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { RolesGuard } from '../../roles/roles.guard';
import { Roles } from '../../roles/roles.decorator';
import { RoleEnum } from '../../roles/roles.enum';

/**
 * JwtAuth(roles?)
 *
 * Single decorator that handles both:
 *   1. JWT authentication (cookie-first, Bearer fallback)
 *   2. Role-based access control
 *
 * Usage examples:
 *   @JwtAuth()                                          — any authenticated user
 *   @JwtAuth(RoleEnum.super_admin)                     — super admins only
 *   @JwtAuth(RoleEnum.admin, RoleEnum.super_admin)     — admins + super admins
 */
export function JwtAuth(...roles: RoleEnum[]) {
  const decorators = [
    ApiBearerAuth(),
    ApiCookieAuth('accessToken'),
    UseGuards(AuthGuard('jwt'), RolesGuard),
    ...(roles.length > 0 ? [Roles(...roles)] : []),
  ];

  return applyDecorators(...decorators);
}
