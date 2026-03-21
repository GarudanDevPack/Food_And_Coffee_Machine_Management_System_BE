import { SetMetadata } from '@nestjs/common';
import { RoleEnum } from './roles.enum';

export const ROLES_KEY = 'roles';

/**
 * Restrict a route to specific roles.
 * Usage: @Roles(RoleEnum.super_admin, RoleEnum.admin)
 */
export const Roles = (...roles: RoleEnum[]) => SetMetadata(ROLES_KEY, roles);
