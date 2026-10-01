import { Transform, Type, type TransformFnParams } from 'class-transformer'
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsEmail,
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
    MinLength,
    ValidateIf,
    ValidateNested,
} from 'class-validator'
import { PAYMENT_METHODS, type PaymentMethod } from '../../common/payment-methods.js'
import { msg } from '../../common/validation/messages.js'
import { MaxInputLength } from '../../common/validation/text-limits.js'
import {
    ID_NUMBER_MESSAGE,
    ID_NUMBER_PATTERN,
    VE_PHONE_PATTERN,
} from '../../common/validation/ve-formats.js'
import { DELIVERY_METHODS } from '../../orders/dto/create-order.dto.js'
import { ORDER_LIMITS } from '../../orders/dto/field-names.js'
import type { DeliveryMethod } from '../../orders/order-pricing.js'
import { QUOTE_STATUSES, type QuoteStatus } from '../quote-status.js'
import { MAX_QUOTE_PRICE, QUOTE_FIELD as FIELD, QUOTE_LIMITS as LIMITS } from './field-names.js'

const trim = ({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value

/** Optional texts: "" (after trimming) is stored as null. */
const trimOrNull = ({ value }: TransformFnParams): unknown => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
}

const trimUpperOrNull = ({ value }: TransformFnParams): unknown => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim().toUpperCase()
    return trimmed === '' ? null : trimmed
}

const trimOrUndefined = ({ value }: TransformFnParams): unknown => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
}

/**
 * One quote line. With `productId` the product's slug, brand and model are filled in from the
 * catalog when not sent; without it the line is free text (installation, materials…).
 */
export class QuoteItemInputDto {
    @IsOptional()
    @Transform(trimOrNull)
    @ValidateIf((_dto, value) => value !== null)
    @IsString({ message: msg.text(FIELD.productId) })
    @MaxLength(80, { message: msg.maxLength(FIELD.productId, 80) })
    productId?: string | null

    /** Required when the product has variants (checked on conversion). */
    @IsOptional()
    @Transform(trimOrNull)
    @ValidateIf((_dto, value) => value !== null)
    @IsString({ message: msg.text(FIELD.variantId) })
    @MaxLength(80, { message: msg.maxLength(FIELD.variantId, 80) })
    variantId?: string | null

    @Transform(trim)
    @IsString({ message: msg.text(FIELD.description) })
    @IsNotEmpty({ message: msg.required(FIELD.description) })
    @MaxLength(LIMITS.description, {
        message: msg.maxLength(FIELD.description, LIMITS.description),
    })
    description: string

    @IsOptional()
    @Transform(trimOrNull)
    @ValidateIf((_dto, value) => value !== null)
    @IsString({ message: msg.text(FIELD.brand) })
    @MaxInputLength(FIELD.brand)
    brand?: string | null

    @IsOptional()
    @Transform(trimOrNull)
    @ValidateIf((_dto, value) => value !== null)
    @IsString({ message: msg.text(FIELD.model) })
    @MaxInputLength(FIELD.model)
    model?: string | null

    @IsInt({ message: msg.integer(FIELD.quantity) })
    @Min(1, { message: msg.min(FIELD.quantity, 1) })
    @Max(LIMITS.quantity, { message: msg.max(FIELD.quantity, LIMITS.quantity) })
    quantity: number

    @IsNumber({ maxDecimalPlaces: 2 }, { message: msg.money(FIELD.unitPrice) })
    @Min(0, { message: msg.notNegative(FIELD.unitPrice) })
    @Max(MAX_QUOTE_PRICE, { message: msg.max(FIELD.unitPrice, MAX_QUOTE_PRICE) })
    unitPrice: number
}

/** Body of `POST /admin/quotes` and `PUT /admin/quotes/:code` (the whole quote). */
export class SaveQuoteDto {
    @Transform(trim)
    @IsString({ message: msg.text(FIELD.customerName) })
    @MinLength(LIMITS.customerName.min, { message: 'Escribe el nombre del cliente.' })
    @MaxLength(LIMITS.customerName.max, {
        message: msg.maxLength(FIELD.customerName, LIMITS.customerName.max),
    })
    customerName: string

    @IsOptional()
    @Transform(trimOrNull)
    @ValidateIf((_dto, value) => value !== null)
    @IsString({ message: msg.text(FIELD.customerEmail) })
    @IsEmail({}, { message: msg.email(FIELD.customerEmail) })
    @MaxLength(LIMITS.email, { message: msg.maxLength(FIELD.customerEmail, LIMITS.email) })
    customerEmail?: string | null

    /** Any Venezuelan number ("0412-5550134"); a mobile one enables the WhatsApp message. */
    @IsOptional()
    @Transform(trimOrNull)
    @ValidateIf((_dto, value) => value !== null)
    @IsString({ message: msg.text(FIELD.customerPhone) })
    @Matches(VE_PHONE_PATTERN, { message: msg.format(FIELD.customerPhone, '0412-5550134') })
    customerPhone?: string | null

    @IsOptional()
    @Transform(trimUpperOrNull)
    @ValidateIf((_dto, value) => value !== null)
    @IsString({ message: msg.text(FIELD.customerIdNumber) })
    @Matches(ID_NUMBER_PATTERN, { message: ID_NUMBER_MESSAGE })
    customerIdNumber?: string | null

    @IsOptional()
    @Transform(trimOrNull)
    @ValidateIf((_dto, value) => value !== null)
    @IsString({ message: msg.text(FIELD.customerCompany) })
    @MaxLength(LIMITS.company, { message: msg.maxLength(FIELD.customerCompany, LIMITS.company) })
    customerCompany?: string | null

    @IsOptional()
    @Transform(trim)
    @IsString({ message: msg.text(FIELD.notes) })
    @MaxLength(LIMITS.notes, { message: msg.maxLength(FIELD.notes, LIMITS.notes) })
    notes?: string

    @IsOptional()
    @Transform(trim)
    @IsString({ message: msg.text(FIELD.terms) })
    @MaxLength(LIMITS.terms, { message: msg.maxLength(FIELD.terms, LIMITS.terms) })
    terms?: string

    /** "YYYY-MM-DD"; today or later (checked by the service). */
    @Transform(trim)
    @IsString({ message: msg.required(FIELD.validUntil) })
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: msg.format(FIELD.validUntil, 'AAAA-MM-DD') })
    validUntil: string

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 }, { message: msg.money(FIELD.discount) })
    @Min(0, { message: msg.notNegative(FIELD.discount) })
    @Max(MAX_QUOTE_PRICE, { message: msg.max(FIELD.discount, MAX_QUOTE_PRICE) })
    discount?: number

    @IsArray({ message: msg.list(FIELD.items) })
    @ArrayMinSize(1, { message: 'Agrega al menos un producto a la cotización.' })
    @ArrayMaxSize(LIMITS.items, { message: msg.listMaxSize(FIELD.items, LIMITS.items) })
    @ValidateNested({ each: true })
    @Type(() => QuoteItemInputDto)
    items: QuoteItemInputDto[]
}

/** Body of `POST /admin/quotes/:code/status`. */
export class QuoteStatusDto {
    @IsIn(QUOTE_STATUSES, { message: msg.invalid(FIELD.status) })
    status: QuoteStatus

    @IsOptional()
    @Transform(trimOrUndefined)
    @IsString({ message: msg.text(FIELD.reason) })
    @MaxLength(LIMITS.reason, { message: msg.maxLength(FIELD.reason, LIMITS.reason) })
    reason?: string
}

/** Body of `POST /admin/quotes/:code/convert`. Address and city are required for delivery. */
export class ConvertQuoteDto {
    @IsIn(DELIVERY_METHODS, { message: msg.invalid(FIELD.deliveryMethod) })
    deliveryMethod: DeliveryMethod

    @IsIn(PAYMENT_METHODS, { message: msg.invalid(FIELD.paymentMethod) })
    paymentMethod: PaymentMethod

    @IsOptional()
    @Transform(trimOrUndefined)
    @IsString({ message: msg.text(FIELD.address) })
    @MinLength(ORDER_LIMITS.address.min, { message: 'Escribe una dirección completa.' })
    @MaxLength(ORDER_LIMITS.address.max, {
        message: msg.maxLength(FIELD.address, ORDER_LIMITS.address.max),
    })
    address?: string

    @IsOptional()
    @Transform(trimOrUndefined)
    @IsString({ message: msg.text(FIELD.city) })
    @MinLength(ORDER_LIMITS.city.min, { message: 'Escribe la ciudad.' })
    @MaxLength(ORDER_LIMITS.city.max, { message: msg.maxLength(FIELD.city, ORDER_LIMITS.city.max) })
    city?: string
}

/** `GET /admin/quotes?status=&search=&page=`. */
export class QuoteQueryDto {
    @IsOptional()
    @IsIn(QUOTE_STATUSES, { message: msg.invalid(FIELD.status) })
    status?: QuoteStatus

    @IsOptional()
    @Transform(trimOrUndefined)
    @IsString({ message: msg.text(FIELD.search) })
    @MaxLength(LIMITS.search, { message: msg.maxLength(FIELD.search, LIMITS.search) })
    search?: string

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: msg.integer(FIELD.page) })
    @Min(1, { message: msg.min(FIELD.page, 1) })
    page: number = 1
}
