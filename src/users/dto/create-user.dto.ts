import { IsIn } from 'class-validator'
import { IsUserEmail, IsUserName, USER_FIELD } from '../../auth/dto/user-fields.js'
import { IsNewPassword } from '../../auth/password-policy.js'
import { Role } from '../../auth/role.enum.js'
import { ROLE_MESSAGE } from './role-message.js'

/** `POST /admin/users`. */
export class CreateUserDto {
    @IsUserName()
    name: string

    @IsUserEmail()
    email: string

    @IsIn(Object.values(Role), { message: ROLE_MESSAGE })
    role: Role

    @IsNewPassword(USER_FIELD.password)
    password: string
}
