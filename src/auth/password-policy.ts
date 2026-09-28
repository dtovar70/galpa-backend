import { applyDecorators } from '@nestjs/common'
import { IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { msg, type FieldName } from '../common/validation/messages.js'

/** Rules for every new password (admin-created, reset or changed from "Mi cuenta"). */
export const PASSWORD_MIN_LENGTH = 10
/** Not a stored text (only its argon2 hash is), so it keeps its own limit. */
export const PASSWORD_MAX_LENGTH = 200
const LETTER = /\p{L}/u
const DIGIT = /[0-9]/

export const passwordMessages = (field: FieldName) => ({
    required: msg.required(field),
    minLength: `${field.name} debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    maxLength: msg.maxLength(field, PASSWORD_MAX_LENGTH),
    letter: `${field.name} debe incluir al menos una letra.`,
    digit: `${field.name} debe incluir al menos un número.`,
})

/** The Spanish problems of `value` as a new password; empty when it follows the policy. */
export function passwordPolicyErrors(value: string, field: FieldName): string[] {
    const messages = passwordMessages(field)
    const errors: string[] = []
    if (value.length < PASSWORD_MIN_LENGTH) errors.push(messages.minLength)
    if (value.length > PASSWORD_MAX_LENGTH) errors.push(messages.maxLength)
    if (!LETTER.test(value)) errors.push(messages.letter)
    if (!DIGIT.test(value)) errors.push(messages.digit)
    return errors
}

/** DTO decorator for a new password: 10–200 characters, at least one letter and one number. */
export function IsNewPassword(field: FieldName): PropertyDecorator {
    const messages = passwordMessages(field)
    return applyDecorators(
        IsString({ message: messages.required }),
        MinLength(PASSWORD_MIN_LENGTH, { message: messages.minLength }),
        MaxLength(PASSWORD_MAX_LENGTH, { message: messages.maxLength }),
        Matches(LETTER, { message: messages.letter }),
        Matches(DIGIT, { message: messages.digit }),
    )
}
