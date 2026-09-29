import { Transform, Type } from 'class-transformer'
import {
    IsBoolean,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
} from 'class-validator'
import { SLUG_PATTERN } from '../../common/utils/text.util.js'
import { msg } from '../../common/validation/messages.js'
import { ADMIN_DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../products.constants.js'
import { FIELD } from './field-names.js'
import { toBoolean, toTrimmedString } from './query-transforms.js'

export class AdminProductQueryDto {
    @IsOptional()
    @Transform(toTrimmedString)
    @IsString({ message: msg.text(FIELD.search) })
    @MaxLength(100, { message: msg.maxLength(FIELD.search, 100) })
    search?: string

    @IsOptional()
    @Matches(SLUG_PATTERN, { message: msg.invalid(FIELD.category) })
    category?: string

    @IsOptional()
    @Transform(toBoolean)
    @IsBoolean({ message: msg.boolean(FIELD.isActive) })
    isActive?: boolean

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: msg.integer(FIELD.page) })
    @Min(1, { message: msg.min(FIELD.page, 1) })
    page: number = 1

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: msg.integer(FIELD.pageSize) })
    @Min(1, { message: msg.min(FIELD.pageSize, 1) })
    @Max(MAX_PAGE_SIZE, { message: msg.max(FIELD.pageSize, MAX_PAGE_SIZE) })
    pageSize: number = ADMIN_DEFAULT_PAGE_SIZE
}
