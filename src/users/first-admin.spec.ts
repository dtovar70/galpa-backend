import argon2 from 'argon2'
import type { Repository } from 'typeorm'
import type { User } from '../auth/entities/user.entity.js'
import { Role } from '../auth/role.enum.js'
import { createFirstAdmin, firstAdminInputErrors } from './first-admin.js'

const INPUT = { email: ' Duena@Example.com ', name: ' Dueña ', password: 'Clave-segura-123' }

function fakeUsers(rows: Partial<User>[]) {
    const insert = vi.fn((row: Partial<User>) => {
        rows.push(row)
        return Promise.resolve({})
    })
    const users = {
        existsBy: (where: Partial<User>) =>
            Promise.resolve(
                rows.some((row) => row.role === where.role && row.isActive === where.isActive),
            ),
        createQueryBuilder: () => {
            let email = ''
            const builder = {
                where: (_sql: string, params: { email: string }) => (
                    (email = params.email),
                    builder
                ),
                getOne: () =>
                    Promise.resolve(rows.find((row) => row.email?.toLowerCase() === email) ?? null),
            }
            return builder
        },
        insert,
    }
    return { users: users as unknown as Repository<User>, insert }
}

describe('createFirstAdmin', () => {
    it('validates the email, the name and the password policy', () => {
        expect(firstAdminInputErrors(INPUT)).toEqual([])
        const errors = firstAdminInputErrors({ email: 'nope', name: ' ', password: 'corta' })
        expect(errors[0]).toBe('El correo electrónico no es válido.')
        expect(errors[1]).toMatch(/^El nombre es obligatorio/)
        expect(errors.length).toBeGreaterThan(2)
    })

    it('creates an active ADMIN with an argon2 hash when there is none', async () => {
        const { users, insert } = fakeUsers([{ email: 'editor@example.com', role: Role.EDITOR }])
        const result = await createFirstAdmin(users, INPUT)
        expect(result).toEqual({ created: true, email: 'duena@example.com' })
        const row = insert.mock.calls[0]![0]
        expect(row).toMatchObject({
            email: 'duena@example.com',
            name: 'Dueña',
            role: Role.ADMIN,
            isActive: true,
        })
        await expect(argon2.verify(row.passwordHash!, INPUT.password)).resolves.toBe(true)
    })

    it('changes nothing when an active ADMIN exists or the email is taken', async () => {
        const withAdmin = fakeUsers([
            { email: 'otra@example.com', role: Role.ADMIN, isActive: true },
        ])
        await expect(createFirstAdmin(withAdmin.users, INPUT)).resolves.toEqual({
            created: false,
            reason: 'admin-exists',
        })
        expect(withAdmin.insert).not.toHaveBeenCalled()

        const taken = fakeUsers([{ email: 'duena@example.com', role: Role.EDITOR, isActive: true }])
        await expect(createFirstAdmin(taken.users, INPUT)).resolves.toEqual({
            created: false,
            reason: 'email-taken',
        })
        expect(taken.insert).not.toHaveBeenCalled()
    })
})
