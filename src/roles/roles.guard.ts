import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { RoleEnum } from './roles.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<(number | string)[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No role restriction on this route
    if (!requiredRoles || !requiredRoles.length) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user?.role?.id) {
      throw new ForbiddenException('Access denied: no role assigned');
    }

    const rawRoleId = user.role.id;

    // Normalise: convert enum name string (e.g. "super_admin") → numeric id string ("1")
    // This handles JWTs where role.id was accidentally stored as the enum name.
    const normaliseRoleId = (raw: string | number): string => {
      const asStr = String(raw);
      // If it looks like an integer string already, use it directly
      if (/^\d+$/.test(asStr)) return asStr;
      // Otherwise try to look it up by enum name (e.g. "super_admin" → 1 → "1")
      const byName = RoleEnum[asStr as keyof typeof RoleEnum];
      return byName !== undefined ? String(byName) : asStr;
    };

    const normalisedId = normaliseRoleId(rawRoleId);
    const hasRole = requiredRoles.map(String).includes(normalisedId);

    if (!hasRole) {
      this.logger.warn(
        `Access denied — raw role.id="${rawRoleId}" (normalised="${normalisedId}"), ` +
          `required=[${requiredRoles.join(', ')}]`,
      );
      throw new ForbiddenException(
        `Access denied: requires one of roles [${requiredRoles.join(', ')}]`,
      );
    }

    return true;
  }
}
