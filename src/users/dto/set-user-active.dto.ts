import { IsBoolean } from 'class-validator'
import { USER_FIELD } from '../../auth/dto/user-fields.js'
import { msg } from '../../common/validation/messages.js'

/** `PATCH /admin/users/:id/active`. Explicit (no toggle), so a double click cannot undo it. */
export class SetUserActiveDto {
    @IsBoolean({ message: msg.boolean(USER_FIELD.isActive) })
    isActive: boolean
}
