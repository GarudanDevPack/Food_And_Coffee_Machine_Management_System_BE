import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
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

    const hasRole = requiredRoles
      .map(String)
      .includes(String(user.role.id));

    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied: requires one of roles [${requiredRoles.join(', ')}]`,
      );
    }

    return true;
  }
}
