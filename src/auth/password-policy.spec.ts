import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { SetUserPasswordDto } from '../users/dto/set-user-password.dto.js'
import { feminine } from '../common/validation/messages.js'
import { passwordPolicyErrors } from './password-policy.js'

const FIELD = feminine('La contraseña')

async function dtoErrors(password: unknown): Promise<string[]> {
    const errors = await validate(plainToInstance(SetUserPasswordDto, { password }))
    return Object.values(errors[0]?.constraints ?? {})
}

describe('password policy', () => {
    it('accepts 10–200 characters with a letter and a number', async () => {
        for (const password of ['abcdefghi1', 'Ñandú-2026!', `a1${'x'.repeat(198)}`]) {
            expect(passwordPolicyErrors(password, FIELD)).toEqual([])
            expect(await dtoErrors(password)).toEqual([])
        }
    })

    it('explains every problem in Spanish', async () => {
        expect(passwordPolicyErrors('abc', FIELD)).toEqual([
            'La contraseña debe tener al menos 10 caracteres.',
            'La contraseña debe incluir al menos un número.',
        ])
        expect(passwordPolicyErrors('1234567890', FIELD)).toEqual([
            'La contraseña debe incluir al menos una letra.',
        ])
        expect(passwordPolicyErrors(`a1${'x'.repeat(199)}`, FIELD)).toEqual([
            'La contraseña no puede superar los 200 caracteres.',
        ])
        expect(await dtoErrors('1234567890')).toEqual([
            'La contraseña debe incluir al menos una letra.',
        ])
        expect(await dtoErrors(undefined)).toContain('La contraseña es obligatoria.')
    })

    it('does not trim: spaces count as characters', () => {
        expect(passwordPolicyErrors('  abc  1  ', FIELD)).toEqual([])
    })
})
