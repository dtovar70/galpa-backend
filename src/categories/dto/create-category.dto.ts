import {
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
} from 'class-validator'
import { HEX_COLOR_PATTERN, SLUG_PATTERN } from '../../common/utils/text.util.js'
import { msg } from '../../common/validation/messages.js'
import {
    CATEGORY_DESCRIPTION_MAX_LENGTH,
    CATEGORY_FIELD as FIELD,
    CATEGORY_NAME_MAX_LENGTH,
    CATEGORY_SLUG_MAX_LENGTH,
    CATEGORY_SORT_ORDER_MAX,
    CATEGORY_TAGLINE_MAX_LENGTH,
} from './field-names.js'

export class CreateCategoryDto {
    @IsString({ message: msg.text(FIELD.name) })
    @IsNotEmpty({ message: msg.required(FIELD.name) })
    @MaxLength(CATEGORY_NAME_MAX_LENGTH, {
        message: msg.maxLength(FIELD.name, CATEGORY_NAME_MAX_LENGTH),
    })
    name: string

    /** Generated from the name when omitted. It is the category's URL and cannot change later. */
    @IsOptional()
    @Matches(SLUG_PATTERN, { message: 'El slug solo admite minúsculas, números y guiones.' })
    @MaxLength(CATEGORY_SLUG_MAX_LENGTH, {
        message: msg.maxLength(FIELD.slug, CATEGORY_SLUG_MAX_LENGTH),
    })
    slug?: string

    @IsOptional()
    @IsString({ message: msg.text(FIELD.tagline) })
    @MaxLength(CATEGORY_TAGLINE_MAX_LENGTH, {
        message: msg.maxLength(FIELD.tagline, CATEGORY_TAGLINE_MAX_LENGTH),
    })
    tagline?: string

    @IsOptional()
    @IsString({ message: msg.text(FIELD.description) })
    @MaxLength(CATEGORY_DESCRIPTION_MAX_LENGTH, {
        message: msg.maxLength(FIELD.description, CATEGORY_DESCRIPTION_MAX_LENGTH),
    })
    description?: string

    @Matches(HEX_COLOR_PATTERN, { message: msg.hexColor(FIELD.color) })
    colorHex: string

    /** Position in menus and lists (ascending). Defaults to after the last category. */
    @IsOptional()
    @IsInt({ message: msg.integer(FIELD.sortOrder) })
    @Min(0, { message: msg.notNegative(FIELD.sortOrder) })
    @Max(CATEGORY_SORT_ORDER_MAX, { message: msg.max(FIELD.sortOrder, CATEGORY_SORT_ORDER_MAX) })
    sortOrder?: number
}
