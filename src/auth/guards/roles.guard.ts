import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ROLES_KEY } from '../../common/decorators/roles.decorator.js'
import type { AuthenticatedRequest } from '../../common/types/auth-user.js'
import type { Role } from '../role.enum.js'

/** Global guard (runs after JwtAuthGuard): enforces @Roles() when present. */
@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ])
        if (!required?.length) return true

        const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>()
        if (!user || !required.includes(user.role)) {
            throw new ForbiddenException('No tienes permisos para realizar esta acción.')
        }
        return true
    }
}
