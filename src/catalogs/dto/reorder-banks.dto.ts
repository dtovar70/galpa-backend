import { ArrayMaxSize, ArrayUnique, IsArray, IsString } from 'class-validator'
import { msg } from '../../common/validation/messages.js'
import { CATALOG_FIELD as FIELD } from './field-names.js'

const CODES_MAX_SIZE = 200

export class ReorderBanksDto {
    /** Every bank code, in the order the selects list them. */
    @IsArray({ message: msg.list(FIELD.bankCodes) })
    @ArrayUnique({ message: msg.listUnique(FIELD.bankCodes) })
    @ArrayMaxSize(CODES_MAX_SIZE, { message: msg.listMaxSize(FIELD.bankCodes, CODES_MAX_SIZE) })
    @IsString({ each: true, message: 'Cada código de banco debe ser un texto.' })
    codes: string[]
}
