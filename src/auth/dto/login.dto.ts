import { Transform } from 'class-transformer'
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator'
import { masculine } from '../../common/validation/messages.js'
import { MaxInputLength } from '../../common/validation/text-limits.js'

const EMAIL = masculine('El correo electrónico')

export class LoginDto {
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim().toLowerCase() : value,
    )
    @IsEmail({}, { message: 'Ingresa un correo electrónico válido.' })
    @MaxInputLength(EMAIL)
    email: string

    @IsString({ message: 'Ingresa tu contraseña.' })
    @IsNotEmpty({ message: 'Ingresa tu contraseña.' })
    /** Not a stored text (only its argon2 hash is), so it keeps its own limit. */
    @MaxLength(200, { message: 'La contraseña es demasiado larga.' })
    password: string
}
