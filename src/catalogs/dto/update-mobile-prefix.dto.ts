import { IsBoolean } from 'class-validator'
import { msg } from '../../common/validation/messages.js'
import { CATALOG_FIELD as FIELD } from './field-names.js'

/** Only (de)activation: the code is the row's identity and cannot change. */
export class UpdateMobilePrefixDto {
    @IsBoolean({ message: msg.boolean(FIELD.mobilePrefixActive) })
    isActive: boolean
}
