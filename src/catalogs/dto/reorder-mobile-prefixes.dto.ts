import { ArrayMaxSize, ArrayUnique, IsArray, IsString } from 'class-validator'
import { msg } from '../../common/validation/messages.js'
import { CATALOG_FIELD as FIELD } from './field-names.js'

/** 04 followed by two digits: at most 100 codes exist. */
const CODES_MAX_SIZE = 100

export class ReorderMobilePrefixesDto {
    /** Every code, in the order the phone selects list them. */
    @IsArray({ message: msg.list(FIELD.mobilePrefixCodes) })
    @ArrayUnique({ message: msg.listUnique(FIELD.mobilePrefixCodes) })
    @ArrayMaxSize(CODES_MAX_SIZE, {
        message: msg.listMaxSize(FIELD.mobilePrefixCodes, CODES_MAX_SIZE),
    })
    @IsString({ each: true, message: 'Cada código de celular debe ser un texto.' })
    codes: string[]
}
