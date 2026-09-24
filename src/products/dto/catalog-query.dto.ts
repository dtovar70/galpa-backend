import { Transform, Type } from 'class-transformer'
import {
    IsArray,
    IsIn,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
} from 'class-validator'
import { SLUG_PATTERN } from '../../common/utils/text.util.js'
import { msg } from '../../common/validation/messages.js'
import {
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    PRODUCT_TAGS,
    SORT_OPTIONS,
    type ProductTag,
    type SortOption,
} from '../products.constants.js'
import { FIELD } from './field-names.js'
import { toStringArray, toTrimmedString } from './query-transforms.js'

export class CatalogQueryDto {
    @IsOptional()
    @Matches(SLUG_PATTERN, { message: msg.invalid(FIELD.category) })
    category?: string

    @IsOptional()
    @Transform(toTrimmedString)
    @IsString({ message: msg.text(FIELD.search) })
    @MaxLength(100, { message: msg.maxLength(FIELD.search, 100) })
    search?: string

    @IsOptional()
    @IsIn(SORT_OPTIONS, { message: 'El orden solicitado no es válido.' })
    sort: SortOption = 'relevance'

    @IsOptional()
    @Type(() => Number)
    @IsNumber({}, { message: msg.number(FIELD.minPrice) })
    @Min(0, { message: msg.notNegative(FIELD.minPrice) })
    minPrice?: number

    @IsOptional()
    @Type(() => Number)
    @IsNumber({}, { message: msg.number(FIELD.maxPrice) })
    @Min(0, { message: msg.notNegative(FIELD.maxPrice) })
    maxPrice?: number

    @IsOptional()
    @Transform(toStringArray)
    @IsArray({ message: msg.list(FIELD.tags) })
    @IsIn(PRODUCT_TAGS, { each: true, message: 'Alguna de las etiquetas no es válida.' })
    tags?: ProductTag[]

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
    pageSize: number = DEFAULT_PAGE_SIZE
}
