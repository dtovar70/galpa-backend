import {
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    ValidateIf,
} from 'class-validator'
import { msg } from '../../common/validation/messages.js'
import { MaxInputLength } from '../../common/validation/text-limits.js'
import {
    CATALOG_DESCRIPTION_MAX_LENGTH,
    CATALOG_FIELD as FIELD,
    CATALOG_SORT_ORDER_MAX,
} from './field-names.js'
import { Trim } from './trim.js'

/** Label, description and position of an orders tab. Its code and statuses are fixed. */
export class UpdateOrderStatusGroupDto {
    @IsOptional()
    @Trim()
    @IsString({ message: msg.text(FIELD.groupLabel) })
    @IsNotEmpty({ message: msg.required(FIELD.groupLabel) })
    @MaxInputLength(FIELD.groupLabel)
    label?: string

    @IsOptional()
    @Trim()
    @ValidateIf((_dto, value) => value !== null)
    @IsString({ message: msg.text(FIELD.groupDescription) })
    @MaxLength(CATALOG_DESCRIPTION_MAX_LENGTH, {
        message: msg.maxLength(FIELD.groupDescription, CATALOG_DESCRIPTION_MAX_LENGTH),
    })
    description?: string | null

    @IsOptional()
    @IsInt({ message: msg.integer(FIELD.sortOrder) })
    @Min(0, { message: msg.notNegative(FIELD.sortOrder) })
    @Max(CATALOG_SORT_ORDER_MAX, { message: msg.max(FIELD.sortOrder, CATALOG_SORT_ORDER_MAX) })
    sortOrder?: number
}
