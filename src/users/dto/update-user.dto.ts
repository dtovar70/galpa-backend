import { IsIn, IsOptional } from 'class-validator'
import { IsUserEmail, IsUserName } from '../../auth/dto/user-fields.js'
import { Role } from '../../auth/role.enum.js'
import { ROLE_MESSAGE } from './role-message.js'

/** `PATCH /admin/users/:id`: every field optional; the password has its own endpoint. */
export class UpdateUserDto {
    @IsOptional()
    @IsUserName()
    name?: string

    @IsOptional()
    @IsUserEmail()
    email?: string

    @IsOptional()
    @IsIn(Object.values(Role), { message: ROLE_MESSAGE })
    role?: Role
}
