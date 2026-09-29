import { Type } from 'class-transformer'
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
import { HEX_COLOR_PATTERN, SLUG_PATTERN } from '../../common/utils/text.util.js'
import { msg } from '../../common/validation/messages.js'
import { MaxInputLength, TEXT_INPUT_MAX_LENGTH } from '../../common/validation/text-limits.js'
import {
    PRODUCT_DESCRIPTION_MAX_LENGTH,
    PRODUCT_MAX_HIGHLIGHTS,
    PRODUCT_TAGS,
    type ProductTag,
} from '../products.constants.js'
import { FIELD } from './field-names.js'

const MAX_PRICE = 99_999_999.99
/** A typo never overflows the `integer` columns, not even summed over every variant. */
const MAX_STOCK = 1_000_000

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

    @IsOptional()
    @MaxInputLength(FIELD.variantColor)
    @Matches(HEX_COLOR_PATTERN, { message: msg.hexColor(FIELD.variantColor) })
    colorHex?: string

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

    @IsString({ message: msg.text(FIELD.printText) })
    @MaxLength(80, { message: msg.maxLength(FIELD.printText, 80) })
    printText: string

    @MaxInputLength(FIELD.color)
    @Matches(HEX_COLOR_PATTERN, { message: msg.hexColor(FIELD.color) })
    colorHex: string

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

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 }, { message: msg.money(FIELD.rating) })
    @Min(0, { message: msg.notNegative(FIELD.rating) })
    @Max(5, { message: msg.max(FIELD.rating, 5) })
    rating?: number

    @IsOptional()
    @IsInt({ message: msg.integer(FIELD.reviewCount) })
    @Min(0, { message: msg.notNegative(FIELD.reviewCount) })
    reviewCount?: number

    /**
     * Only for a product without variants (0 when omitted). With variants the product's stock
     * is the sum of theirs, so this value is ignored.
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
