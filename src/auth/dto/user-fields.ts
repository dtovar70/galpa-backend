import { applyDecorators } from '@nestjs/common'
import { Transform } from 'class-transformer'
import { IsEmail, IsNotEmpty, IsString } from 'class-validator'
import { feminine, masculine, msg } from '../../common/validation/messages.js'
import { MaxInputLength } from '../../common/validation/text-limits.js'

export const USER_FIELD = {
    name: masculine('El nombre'),
    email: masculine('El correo electrónico'),
    role: masculine('El rol'),
    password: feminine('La contraseña'),
    newPassword: feminine('La nueva contraseña'),
    currentPassword: feminine('La contraseña actual'),
    isActive: masculine('El estado activo'),
} as const

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)
const trimLower = ({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value

/** A person's display name: trimmed, 1–100 characters. */
export function IsUserName(): PropertyDecorator {
    return applyDecorators(
        Transform(trim),
        IsString({ message: msg.required(USER_FIELD.name) }),
        IsNotEmpty({ message: msg.required(USER_FIELD.name) }),
        MaxInputLength(USER_FIELD.name),
    )
}

/** A login email: trimmed and lowercased, so uniqueness never depends on case. */
export function IsUserEmail(): PropertyDecorator {
    return applyDecorators(
        Transform(trimLower),
        IsEmail({}, { message: msg.email(USER_FIELD.email) }),
        MaxInputLength(USER_FIELD.email),
    )
}
