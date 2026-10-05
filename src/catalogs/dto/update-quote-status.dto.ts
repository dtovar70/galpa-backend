import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { msg } from '../../common/validation/messages.js'
import { MaxInputLength } from '../../common/validation/text-limits.js'
import { BADGE_TONES, type BadgeTone } from '../badge-tones.js'
import { CATALOG_DESCRIPTION_MAX_LENGTH, CATALOG_FIELD as FIELD } from './field-names.js'
import { Trim } from './trim.js'

/**
 * What the admin may change about a quote status. The code, its position and `isTerminal` drive
 * behavior and are not accepted (the global pipe answers 400 for any other field).
 */
export class UpdateQuoteStatusDto {
    @IsOptional()
    @Trim()
    @IsString({ message: msg.text(FIELD.statusLabel) })
    @IsNotEmpty({ message: msg.required(FIELD.statusLabel) })
    @MaxInputLength(FIELD.statusLabel)
    label?: string

    @IsOptional()
    @Trim()
    @IsString({ message: msg.text(FIELD.quoteStatusDescription) })
    @IsNotEmpty({ message: msg.required(FIELD.quoteStatusDescription) })
    @MaxLength(CATALOG_DESCRIPTION_MAX_LENGTH, {
        message: msg.maxLength(FIELD.quoteStatusDescription, CATALOG_DESCRIPTION_MAX_LENGTH),
    })
    description?: string

    @IsOptional()
    @IsIn(BADGE_TONES, { message: msg.invalid(FIELD.tone) })
    tone?: BadgeTone
}
