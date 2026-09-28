import { IsString, MaxLength } from 'class-validator'
import { IsNewPassword } from '../../password-policy.js'
import { IsUserEmail, USER_FIELD } from '../../dto/user-fields.js'

/** `POST /auth/password-reset/request`. */
export class PasswordResetRequestDto {
    @IsUserEmail()
    email: string
}

/**
 * `POST /auth/password-reset/confirm`. The code is only checked for being a short text here: a
 * wrong format gets the same generic answer as a wrong code (see PasswordResetService).
 */
export class PasswordResetConfirmDto {
    @IsUserEmail()
    email: string

    @IsString({ message: 'Escribe el código de 6 dígitos.' })
    @MaxLength(20, { message: 'Escribe el código de 6 dígitos.' })
    code: string

    @IsNewPassword(USER_FIELD.newPassword)
    newPassword: string
}
