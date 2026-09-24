import { Transform } from 'class-transformer'
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator'
import { masculine, msg } from '../../common/validation/messages.js'

const EMAIL = masculine('El correo electrónico')

export class LoginDto {
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim().toLowerCase() : value,
    )
    @IsEmail({}, { message: 'Ingresa un correo electrónico válido.' })
    @MaxLength(254, { message: msg.maxLength(EMAIL, 254) })
    email: string

    @IsString({ message: 'Ingresa tu contraseña.' })
    @IsNotEmpty({ message: 'Ingresa tu contraseña.' })
    @MaxLength(200, { message: 'La contraseña es demasiado larga.' })
    password: string
}
