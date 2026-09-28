import { IsNotEmpty, IsString, MaxLength } from 'class-validator'
import { msg } from '../../common/validation/messages.js'
import { IsNewPassword, PASSWORD_MAX_LENGTH } from '../password-policy.js'
import { USER_FIELD } from './user-fields.js'

/** `POST /auth/me/password`. */
export class ChangePasswordDto {
    @IsString({ message: 'Ingresa tu contraseña actual.' })
    @IsNotEmpty({ message: 'Ingresa tu contraseña actual.' })
    @MaxLength(PASSWORD_MAX_LENGTH, {
        message: msg.maxLength(USER_FIELD.currentPassword, PASSWORD_MAX_LENGTH),
    })
    currentPassword: string

    @IsNewPassword(USER_FIELD.newPassword)
    newPassword: string
}
