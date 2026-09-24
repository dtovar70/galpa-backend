import { IsBoolean, IsOptional } from 'class-validator'
import { masculine, msg } from '../../common/validation/messages.js'

export class SetActiveDto {
    /** Omit to toggle the current value. */
    @IsOptional()
    @IsBoolean({ message: msg.boolean(masculine('El estado activo')) })
    isActive?: boolean
}
