import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import type { AuthenticatedRequest, AuthUser } from '../types/auth-user.js'

/** Injects the user attached by JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): AuthUser | undefined =>
        ctx.switchToHttp().getRequest<AuthenticatedRequest>().user,
)
