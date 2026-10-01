import argon2 from 'argon2'
import { isEmail } from 'class-validator'
import type { Repository } from 'typeorm'
import { User } from '../auth/entities/user.entity.js'
import { passwordPolicyErrors } from '../auth/password-policy.js'
import { Role } from '../auth/role.enum.js'
import { feminine } from '../common/validation/messages.js'
import { TEXT_INPUT_MAX_LENGTH } from '../common/validation/text-limits.js'
import { newId } from '../database/id.js'

export interface FirstAdminInput {
    email: string
    name: string
    password: string
}

export type FirstAdminResult =
    { created: true; email: string } | { created: false; reason: 'admin-exists' | 'email-taken' }

/** Problems with the input, in Spanish like the panel's own forms (empty when it is valid). */
export function firstAdminInputErrors(input: FirstAdminInput): string[] {
    const errors: string[] = []
    const email = input.email.trim()
    if (!isEmail(email) || email.length > TEXT_INPUT_MAX_LENGTH) {
        errors.push('El correo electrónico no es válido.')
    }
    const name = input.name.trim()
    if (!name || name.length > TEXT_INPUT_MAX_LENGTH) {
        errors.push(`El nombre es obligatorio (máximo ${TEXT_INPUT_MAX_LENGTH} caracteres).`)
    }
    errors.push(...passwordPolicyErrors(input.password, feminine('La contraseña')))
    return errors
}

/**
 * Production bootstrap: creates the first ADMIN (password hashed with argon2, like the app) only
 * while no active ADMIN exists, and never touches an existing account. No demo data. After it,
 * every other user is managed from the panel (`/admin/users`).
 */
export async function createFirstAdmin(
    users: Repository<User>,
    input: FirstAdminInput,
): Promise<FirstAdminResult> {
    if (await users.existsBy({ role: Role.ADMIN, isActive: true })) {
        return { created: false, reason: 'admin-exists' }
    }
    const email = input.email.trim().toLowerCase()
    const taken = await users
        .createQueryBuilder('user')
        .where('LOWER(user.email) = :email', { email })
        .getOne()
    if (taken) return { created: false, reason: 'email-taken' }

    await users.insert({
        id: newId(),
        email,
        name: input.name.trim(),
        passwordHash: await argon2.hash(input.password),
        role: Role.ADMIN,
        isActive: true,
    })
    return { created: true, email }
}
