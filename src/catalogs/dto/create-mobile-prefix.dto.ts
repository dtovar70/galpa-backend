import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator'
import { msg } from '../../common/validation/messages.js'
import { CATALOG_FIELD as FIELD } from './field-names.js'
import { Trim } from './trim.js'

/** Same rule as the `mobile_prefixes_code_check` CHECK. */
export const MOBILE_PREFIX_CODE_PATTERN = /^04\d{2}$/

export class CreateMobilePrefixDto {
    /** Four digits starting with 04 ("0424"). It identifies the row and cannot change later. */
    @Trim()
    @IsString({ message: msg.text(FIELD.mobilePrefixCode) })
    @Matches(MOBILE_PREFIX_CODE_PATTERN, {
        message: msg.format(FIELD.mobilePrefixCode, '0424 (4 dígitos que empiezan por 04)'),
    })
    code: string

    @IsOptional()
    @IsBoolean({ message: msg.boolean(FIELD.mobilePrefixActive) })
    isActive?: boolean
}
