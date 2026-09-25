import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator'
import { msg } from '../../common/validation/messages.js'
import { MaxInputLength } from '../../common/validation/text-limits.js'
import { CATALOG_FIELD as FIELD } from './field-names.js'
import { Trim } from './trim.js'

export const BANK_CODE_PATTERN = /^\d{4}$/

export class CreateBankDto {
    /** The bank's four-digit code. It identifies the bank and cannot change later. */
    @Trim()
    @IsString({ message: msg.text(FIELD.bankCode) })
    @Matches(BANK_CODE_PATTERN, { message: msg.format(FIELD.bankCode, '0102 (4 dígitos)') })
    code: string

    @Trim()
    @IsString({ message: msg.text(FIELD.bankName) })
    @IsNotEmpty({ message: msg.required(FIELD.bankName) })
    @MaxInputLength(FIELD.bankName)
    name: string

    @IsOptional()
    @IsBoolean({ message: msg.boolean(FIELD.isActive) })
    isActive?: boolean
}
