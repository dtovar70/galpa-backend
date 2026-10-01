import { Transform, Type, type TransformFnParams } from 'class-transformer'
import {
    ArrayMaxSize,
    ArrayUnique,
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    ValidateIf,
    ValidateNested,
} from 'class-validator'
import { SLUG_PATTERN } from '../../common/utils/text.util.js'
import { msg } from '../../common/validation/messages.js'
import { MaxInputLength, TEXT_INPUT_MAX_LENGTH } from '../../common/validation/text-limits.js'
import {
    MAX_BTU,
    MAX_LEAD_TIME_DAYS,
    PRODUCT_DESCRIPTION_MAX_LENGTH,
    PRODUCT_MAX_HIGHLIGHTS,
    PRODUCT_MAX_SPECS,
    PRODUCT_SPEC_LABEL_MAX_LENGTH,
    PRODUCT_SPEC_VALUE_MAX_LENGTH,
    PRODUCT_TAGS,
    STOCK_MODES,
    type ProductTag,
    type StockMode,
} from '../products.constants.js'
import { FIELD } from './field-names.js'

const MAX_PRICE = 99_999_999.99
/** A typo never overflows the `integer` columns, not even summed over every variant. */
const MAX_STOCK = 1_000_000
/** SKU: letters, digits and `-`, `_`, `.`, `/` ("DK-FTKF12-220"). */
const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/

const trim = ({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value

/** Optional texts: "" (after trimming) is stored as null. */
const trimOrNull = ({ value }: TransformFnParams): unknown => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
}

/** One row of the "ficha técnica" ("Capacidad" / "12.000 BTU"). */
export class ProductSpecInputDto {
    @Transform(trim)
    @IsString({ message: msg.text(FIELD.specLabel) })
    @IsNotEmpty({ message: msg.required(FIELD.specLabel) })
    @MaxLength(PRODUCT_SPEC_LABEL_MAX_LENGTH, {
        message: msg.maxLength(FIELD.specLabel, PRODUCT_SPEC_LABEL_MAX_LENGTH),
    })
    label: string

    @Transform(trim)
    @IsString({ message: msg.text(FIELD.specValue) })
    @IsNotEmpty({ message: msg.required(FIELD.specValue) })
    @MaxLength(PRODUCT_SPEC_VALUE_MAX_LENGTH, {
        message: msg.maxLength(FIELD.specValue, PRODUCT_SPEC_VALUE_MAX_LENGTH),
    })
    value: string
}

export class ProductVariantInputDto {
    /**
     * An existing variant of this product keeps its id (orders and carts point to it); omit it
     * for a new variant. Unknown ids get a new one.
     */
    @IsOptional()
    @IsString({ message: msg.text(FIELD.variantId) })
    @MaxLength(80, { message: msg.maxLength(FIELD.variantId, 80) })
    id?: string

    @IsString({ message: msg.text(FIELD.variantLabel) })
    @IsNotEmpty({ message: msg.required(FIELD.variantLabel) })
    @MaxLength(80, { message: msg.maxLength(FIELD.variantLabel, 80) })
    label: string

    @IsNumber({ maxDecimalPlaces: 2 }, { message: msg.money(FIELD.variantPriceDelta) })
    @Min(-MAX_PRICE, { message: msg.min(FIELD.variantPriceDelta, -MAX_PRICE) })
    @Max(MAX_PRICE, { message: msg.max(FIELD.variantPriceDelta, MAX_PRICE) })
    priceDelta: number

    @IsInt({ message: msg.integer(FIELD.variantStock) })
    @Min(0, { message: msg.notNegative(FIELD.variantStock) })
    @Max(MAX_STOCK, { message: msg.max(FIELD.variantStock, MAX_STOCK) })
    stock: number
}

export class CreateProductDto {
    /** Generated from the name when omitted. */
    @IsOptional()
    @Matches(SLUG_PATTERN, { message: 'El slug solo admite minúsculas, números y guiones.' })
    @MaxLength(80, { message: msg.maxLength(FIELD.slug, 80) })
    slug?: string

    @IsString({ message: msg.text(FIELD.name) })
    @IsNotEmpty({ message: msg.required(FIELD.name) })
    @MaxInputLength(FIELD.name)
    name: string

    @Matches(SLUG_PATTERN, { message: msg.invalid(FIELD.category) })
    categorySlug: string

    @IsNumber({ maxDecimalPlaces: 2 }, { message: msg.money(FIELD.price) })
    @Min(0, { message: msg.notNegative(FIELD.price) })
    @Max(MAX_PRICE, { message: msg.max(FIELD.price, MAX_PRICE) })
    price: number

    /** Send null to remove the "before" price. */
    @IsOptional()
    @ValidateIf((_object, value) => value !== null)
    @IsNumber({ maxDecimalPlaces: 2 }, { message: msg.money(FIELD.compareAtPrice) })
    @Min(0, { message: msg.notNegative(FIELD.compareAtPrice) })
    @Max(MAX_PRICE, { message: msg.max(FIELD.compareAtPrice, MAX_PRICE) })
    compareAtPrice?: number | null

    @Transform(trim)
    @IsString({ message: msg.text(FIELD.brand) })
    @IsNotEmpty({ message: msg.required(FIELD.brand) })
    @MaxInputLength(FIELD.brand)
    brand: string

    @IsOptional()
    @Transform(trimOrNull)
    @ValidateIf((_object, value) => value !== null)
    @IsString({ message: msg.text(FIELD.model) })
    @MaxInputLength(FIELD.model)
    model?: string | null

    /** Unique among the products that have one. */
    @IsOptional()
    @Transform(trimOrNull)
    @ValidateIf((_object, value) => value !== null)
    @IsString({ message: msg.text(FIELD.sku) })
    @MaxLength(60, { message: msg.maxLength(FIELD.sku, 60) })
    @Matches(SKU_PATTERN, {
        message: 'El SKU solo admite letras, números, puntos, guiones y barras.',
    })
    sku?: string | null

    /** STOCK by default. */
    @IsOptional()
    @IsIn(STOCK_MODES, { message: msg.invalid(FIELD.stockMode) })
    stockMode?: StockMode

    @IsOptional()
    @ValidateIf((_object, value) => value !== null)
    @IsInt({ message: msg.integer(FIELD.leadTimeDays) })
    @Min(0, { message: msg.notNegative(FIELD.leadTimeDays) })
    @Max(MAX_LEAD_TIME_DAYS, { message: msg.max(FIELD.leadTimeDays, MAX_LEAD_TIME_DAYS) })
    leadTimeDays?: number | null

    @IsOptional()
    @ValidateIf((_object, value) => value !== null)
    @IsInt({ message: msg.integer(FIELD.btu) })
    @Min(1, { message: msg.min(FIELD.btu, 1) })
    @Max(MAX_BTU, { message: msg.max(FIELD.btu, MAX_BTU) })
    btu?: number | null

    @IsOptional()
    @Transform(trimOrNull)
    @ValidateIf((_object, value) => value !== null)
    @IsString({ message: msg.text(FIELD.voltage) })
    @MaxLength(40, { message: msg.maxLength(FIELD.voltage, 40) })
    voltage?: string | null

    @IsOptional()
    @ValidateIf((_object, value) => value !== null)
    @IsBoolean({ message: msg.boolean(FIELD.isInverter) })
    isInverter?: boolean | null

    @IsOptional()
    @Transform(trimOrNull)
    @ValidateIf((_object, value) => value !== null)
    @IsString({ message: msg.text(FIELD.refrigerant) })
    @MaxLength(40, { message: msg.maxLength(FIELD.refrigerant, 40) })
    refrigerant?: string | null

    @IsString({ message: msg.text(FIELD.description) })
    @MaxLength(PRODUCT_DESCRIPTION_MAX_LENGTH, {
        message: msg.maxLength(FIELD.description, PRODUCT_DESCRIPTION_MAX_LENGTH),
    })
    description: string

    @IsOptional()
    @IsArray({ message: msg.list(FIELD.highlights) })
    @ArrayMaxSize(PRODUCT_MAX_HIGHLIGHTS, {
        message: msg.listMaxSize(FIELD.highlights, PRODUCT_MAX_HIGHLIGHTS),
    })
    @IsString({ each: true, message: 'Cada destacado debe ser un texto.' })
    @MaxLength(TEXT_INPUT_MAX_LENGTH, {
        each: true,
        message: `Cada destacado no puede superar los ${TEXT_INPUT_MAX_LENGTH} caracteres.`,
    })
    highlights?: string[]

    @IsOptional()
    @IsArray({ message: msg.list(FIELD.tags) })
    @ArrayUnique({ message: msg.listUnique(FIELD.tags) })
    @IsIn(PRODUCT_TAGS, { each: true, message: 'Alguna de las etiquetas no es válida.' })
    tags?: ProductTag[]

    /** "Ficha técnica", in display order. On update, when present, replaces the list. */
    @IsOptional()
    @IsArray({ message: msg.list(FIELD.specs) })
    @ArrayMaxSize(PRODUCT_MAX_SPECS, { message: msg.listMaxSize(FIELD.specs, PRODUCT_MAX_SPECS) })
    @ValidateNested({ each: true, message: 'Cada fila de la ficha técnica debe ser un objeto.' })
    @Type(() => ProductSpecInputDto)
    specs?: ProductSpecInputDto[]

    /**
     * Only for a product without variants (0 when omitted). With variants the product's stock
     * is the sum of theirs, so this value is ignored. ON_ORDER products ignore it.
     */
    @IsOptional()
    @IsInt({ message: msg.integer(FIELD.stock) })
    @Min(0, { message: msg.notNegative(FIELD.stock) })
    @Max(MAX_STOCK, { message: msg.max(FIELD.stock, MAX_STOCK) })
    stock?: number

    @IsOptional()
    @IsBoolean({ message: msg.boolean(FIELD.isActive) })
    isActive?: boolean

    /** On update, when present, replaces the full variant list (order = array order). */
    @IsOptional()
    @IsArray({ message: msg.list(FIELD.variants) })
    @ArrayMaxSize(30, { message: msg.listMaxSize(FIELD.variants, 30) })
    @ValidateNested({ each: true, message: 'Cada variante debe ser un objeto.' })
    @Type(() => ProductVariantInputDto)
    variants?: ProductVariantInputDto[]
}
