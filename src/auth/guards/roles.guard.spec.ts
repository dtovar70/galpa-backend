import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { AuthUser } from '../../common/types/auth-user.js'
import { Role } from '../role.enum.js'
import { RolesGuard } from './roles.guard.js'

function contextFor(user?: Partial<AuthUser>): ExecutionContext {
    return {
        getHandler: () => () => undefined,
        getClass: () => class {},
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext
}

describe('RolesGuard', () => {
    const reflector = new Reflector()
    const guard = new RolesGuard(reflector)

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('allows routes without @Roles()', () => {
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined)
        expect(guard.canActivate(contextFor())).toBe(true)
    })

    it('allows users with one of the required roles', () => {
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN, Role.EDITOR])
        expect(guard.canActivate(contextFor({ role: Role.EDITOR }))).toBe(true)
    })

    it('rejects users without the required role', () => {
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN])
        expect(() => guard.canActivate(contextFor({ role: Role.EDITOR }))).toThrow(
            ForbiddenException,
        )
    })

    it('rejects when no user is attached', () => {
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN])
        expect(() => guard.canActivate(contextFor())).toThrow(ForbiddenException)
    })
})
