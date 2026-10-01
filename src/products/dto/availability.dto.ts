import { Transform, Type, type TransformFnParams } from 'class-transformer'
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator'
import { msg } from '../../common/validation/messages.js'
import { AVAILABILITY_ID_MAX_LENGTH, AVAILABILITY_MAX_ITEMS } from '../products.constants.js'
import { FIELD } from './field-names.js'

const trim = ({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value

/** Empty strings are treated as "not sent" (a product without variants). */
const trimOrUndefined = ({ value }: TransformFnParams): unknown => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
}

/** One cart line to check: only identifiers, never quantities. */
export class AvailabilityItemDto {
    @Transform(trim)
    @IsString({ message: msg.text(FIELD.productId) })
    @IsNotEmpty({ message: msg.required(FIELD.productId) })
    @MaxLength(AVAILABILITY_ID_MAX_LENGTH, {
        message: msg.maxLength(FIELD.productId, AVAILABILITY_ID_MAX_LENGTH),
    })
    productId: string

    @IsOptional()
    @Transform(trimOrUndefined)
    @IsString({ message: msg.text(FIELD.variantId) })
    @MaxLength(AVAILABILITY_ID_MAX_LENGTH, {
        message: msg.maxLength(FIELD.variantId, AVAILABILITY_ID_MAX_LENGTH),
    })
    variantId?: string
}

/** Body of `POST /products/availability`: the cart lines whose live stock is needed. */
export class AvailabilityQueryDto {
    @IsArray({ message: msg.list(FIELD.availabilityItems) })
    @ArrayMinSize(1, { message: msg.listMinSize(FIELD.availabilityItems, 1) })
    @ArrayMaxSize(AVAILABILITY_MAX_ITEMS, {
        message: msg.listMaxSize(FIELD.availabilityItems, AVAILABILITY_MAX_ITEMS),
    })
    @ValidateNested({ each: true })
    @Type(() => AvailabilityItemDto)
    items: AvailabilityItemDto[]
}
