import { SetMetadata } from '@nestjs/common'
import type { Role } from '../../auth/role.enum.js'

export const ROLES_KEY = 'roles'

/** Restricts a route (or controller) to the given roles. Method-level metadata wins. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles)
