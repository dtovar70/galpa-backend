import { Transform, Type } from 'class-transformer'
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
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
    AVAILABILITY_FILTERS,
    MAX_BTU,
    PRODUCT_TAGS,
    SORT_OPTIONS,
    type AvailabilityFilter,
    type ProductTag,
    type SortOption,
} from '../products.constants.js'
import { FIELD } from './field-names.js'
import { toBoolean, toStringArray, toTrimmedString } from './query-transforms.js'

/** Brands per `?brand=` (the store shows a few dozen at most). */
const MAX_BRAND_FILTERS = 20

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

    /** `?brand=Daikin,LG` (or repeated): any of them. */
    @IsOptional()
    @Transform(toStringArray)
    @IsArray({ message: msg.list(FIELD.brand) })
    @ArrayMaxSize(MAX_BRAND_FILTERS, { message: msg.listMaxSize(FIELD.brand, MAX_BRAND_FILTERS) })
    @IsString({ each: true, message: 'Cada marca debe ser un texto.' })
    @MaxLength(100, { each: true, message: 'Cada marca no puede superar los 100 caracteres.' })
    brand?: string[]

    @IsOptional()
    @IsIn(AVAILABILITY_FILTERS, { message: msg.invalid(FIELD.availability) })
    availability?: AvailabilityFilter

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: msg.integer(FIELD.btuMin) })
    @Min(0, { message: msg.notNegative(FIELD.btuMin) })
    @Max(MAX_BTU, { message: msg.max(FIELD.btuMin, MAX_BTU) })
    btuMin?: number

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: msg.integer(FIELD.btuMax) })
    @Min(0, { message: msg.notNegative(FIELD.btuMax) })
    @Max(MAX_BTU, { message: msg.max(FIELD.btuMax, MAX_BTU) })
    btuMax?: number

    @IsOptional()
    @Transform(toTrimmedString)
    @IsString({ message: msg.text(FIELD.voltage) })
    @MaxLength(40, { message: msg.maxLength(FIELD.voltage, 40) })
    voltage?: string

    @IsOptional()
    @Transform(toBoolean)
    @IsBoolean({ message: msg.boolean(FIELD.inverter) })
    inverter?: boolean

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
