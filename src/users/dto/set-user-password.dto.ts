import { USER_FIELD } from '../../auth/dto/user-fields.js'
import { IsNewPassword } from '../../auth/password-policy.js'

/** `POST /admin/users/:id/password`: an ADMIN sets a new password for someone else. */
export class SetUserPasswordDto {
    @IsNewPassword(USER_FIELD.password)
    password: string
}
